# backend/app.py
import os
from flask import Flask, request, jsonify, g
from flask_cors import CORS
from functools import wraps
import jwt
from datetime import datetime, timezone, timedelta
from werkzeug.security import check_password_hash
import enum
import io # Keep for CSV
import logging # Import logging

# Import models and config
# Make sure UserGroup is imported
from models import db, User, Exam, Question, RoleEnum, ExamStatusEnum, ExamSubmission, UserGroup, NotificationLog, NotificationType
from config import Config
from dotenv import load_dotenv

# Import utilities from SQLAlchemy
from sqlalchemy.orm import joinedload, selectinload # selectinload can be efficient for one-to-many
from sqlalchemy.exc import IntegrityError # For handling unique constraint violations

# --- Import the proctoring module ---
# Assuming proctoring.py exists and has the necessary functions
try:
    import proctoring
except ImportError:
    # Create a dummy proctoring module if not found, allowing app to run
    class DummyProctoring:
        def initialize_proctoring_state(self, user_id): pass
        def clear_proctoring_state(self, user_id): pass
        def analyze_frame_proctoring(self, user_id, frame_data):
            # Return a default non-cheating response
            return {"success": True, "cheating_detected": False, "reason": "Proctoring disabled"}
    proctoring = DummyProctoring()
    logging.warning("Proctoring module not found, using dummy implementation.")


# Import pandas for CSV processing
try:
    import pandas as pd
except ImportError:
    pd = None # Handle gracefully if pandas is not installed
    logging.warning("Pandas library not found. CSV import feature will be disabled.")


load_dotenv()


# Factory function to create the Flask application
def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    # --- Configure Logging ---
    # Use Flask's built-in logger setup
    # Level set via basicConfig or app.logger.setLevel
    log_level = os.environ.get('LOG_LEVEL', 'INFO').upper()
    logging.basicConfig(level=log_level,
                        format='%(asctime)s %(levelname)s %(name)s %(threadName)s : %(message)s')
    app.logger.info(f"Flask App starting with log level {log_level}")
    # --------------------------

    # Create instance folder if it doesn't exist
    try:
        if not os.path.exists(app.instance_path):
             app.logger.info(f"Creating instance folder at {app.instance_path}")
             os.makedirs(app.instance_path)
    except OSError as e:
        app.logger.error(f"Error creating instance path {app.instance_path}: {e}", exc_info=True)
        # Consider exiting if instance path is critical and cannot be created

    db.init_app(app)
    CORS(app, resources={r"/api/*": {"origins": ["http://localhost:3000", "http://127.0.0.1:3000"], # Allow both localhost and 127.0.0.1 for dev
                                "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
                                "allow_headers": ["Content-Type", "Authorization"],
                                "supports_credentials": True }}) # Often needed if frontend sends cookies/auth


    # --- Authentication Helper Functions ---
    def create_token(user_id, role):
        payload = {
            'user_id': user_id,
            'role': role.value if isinstance(role, enum.Enum) else role, # Handle enum or string
            'exp': datetime.now(timezone.utc) + app.config['JWT_EXPIRATION_DELTA']
        }
        token = jwt.encode(payload, app.config['SECRET_KEY'], algorithm='HS256')
        return token

    def token_required(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            token = None
            auth_header = request.headers.get('Authorization')
            if auth_header and auth_header.startswith('Bearer '):
                token = auth_header.split(" ")[1]
            if not token:
                app.logger.warning("Token is missing from request headers.")
                return jsonify({'message': 'Token is missing'}), 401
            try:
                data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
                current_user = db.session.get(User, data['user_id']) # Use session.get for primary key lookup
                if not current_user:
                     app.logger.warning(f"User with ID {data['user_id']} (from token) not found in database.")
                     return jsonify({'message': 'User not found'}), 401
                g.current_user = current_user
                g.current_role = data['role'] # Store role from token
                app.logger.debug(f"Token validated for user {g.current_user.username} (Role: {g.current_role})")
            except jwt.ExpiredSignatureError:
                app.logger.info("Token has expired.")
                return jsonify({'message': 'Token has expired'}), 401
            except jwt.InvalidTokenError as e:
                app.logger.warning(f"Token is invalid: {e}")
                return jsonify({'message': 'Token is invalid'}), 401
            except Exception as e:
                 app.logger.exception(f"Unexpected error during token validation: {e}") # Log full exception
                 return jsonify({'message': 'Token validation error'}), 401
            return f(*args, **kwargs)
        return decorated

    def admin_required(f):
        @wraps(f)
        @token_required
        def decorated(*args, **kwargs):
            if g.current_role != RoleEnum.ADMIN.value:
                 app.logger.warning(f"Admin action denied for user {g.current_user.username} (Role: {g.current_role}) on endpoint {request.path}")
                 return jsonify({'message': 'Admin privileges required'}), 403
            return f(*args, **kwargs)
        return decorated

    def student_required(f):
        @wraps(f)
        @token_required
        def decorated(*args, **kwargs):
             if g.current_role != RoleEnum.STUDENT.value:
                 app.logger.warning(f"Student action denied for user {g.current_user.username} (Role: {g.current_role}) on endpoint {request.path}")
                 return jsonify({'message': 'Student privileges required'}), 403
             return f(*args, **kwargs)
        return decorated


    # --- API Routes ---

    # Authentication Routes
    @app.route('/api/login', methods=['POST'])
    def login():
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        if not username or not password:
            return jsonify({'message': 'Username and password required'}), 400
        user = User.query.filter_by(username=username).first()
        if not user or not user.check_password(password):
            app.logger.warning(f"Failed login attempt for username: {username}")
            return jsonify({'message': 'Invalid credentials'}), 401
        token = create_token(user.id, user.role)
        app.logger.info(f"User '{user.username}' logged in successfully.")
        return jsonify({'token': token, 'role': user.role.value, 'username': user.username}) # Return role and username

    @app.route('/api/register', methods=['POST'])
    def register():
        data = request.get_json()
        username = data.get('username', '').strip()
        password = data.get('password', '')
        if not username or not password:
            return jsonify({'message': 'Username and password required'}), 400
        if len(username) < 3: return jsonify({'message': 'Username must be at least 3 characters long'}), 400
        if len(password) < 6: return jsonify({'message': 'Password must be at least 6 characters long'}), 400

        # Check for existing user case-insensitively if desired
        existing_user = User.query.filter(User.username.ilike(username)).first()
        if existing_user:
             app.logger.warning(f"Registration attempt failed: Username '{username}' already exists.")
             return jsonify({'message': 'Username already exists'}), 409
        try:
            new_user = User(username=username, role=RoleEnum.STUDENT) # Default role
            new_user.set_password(password)
            db.session.add(new_user)
            db.session.commit()
            app.logger.info(f"New student registered: {username} (ID: {new_user.id})")
            return jsonify({'message': 'Student registered successfully'}), 201
        except IntegrityError as e: # Catch potential race condition on unique constraint
             db.session.rollback()
             app.logger.error(f"Database integrity error during registration for {username}: {e}", exc_info=True)
             return jsonify({'message': 'Username already exists or database constraint violated.'}), 409
        except Exception as e:
            db.session.rollback()
            app.logger.exception(f"Error during registration for {username}: {e}")
            return jsonify({'message': 'Registration failed due to an internal error'}), 500

    # --- Admin Routes ---

    # Dashboard
    @app.route('/api/admin/dashboard/stats', methods=['GET'])
    @admin_required
    def get_admin_dashboard_stats():
        try:
            total_exams = db.session.query(Exam.id).count()
            active_exams = db.session.query(Exam.id).filter(Exam.status == ExamStatusEnum.PUBLISHED).count()
            total_students = db.session.query(User.id).filter(User.role == RoleEnum.STUDENT).count()
            total_groups = db.session.query(UserGroup.id).count()
            twenty_four_hours_ago = datetime.now(timezone.utc) - timedelta(hours=24)
            recent_submissions = db.session.query(ExamSubmission.id)\
                                     .filter(ExamSubmission.submitted_at >= twenty_four_hours_ago)\
                                     .count()
            stats_data = {
                "totalExams": total_exams, "activeExams": active_exams,
                "totalStudents": total_students, "recentSubmissions": recent_submissions,
                "totalGroups": total_groups
            }
            return jsonify(stats_data), 200
        except Exception as e:
            app.logger.exception(f"Error calculating admin dashboard stats: {e}")
            return jsonify({"message": "Error fetching dashboard statistics."}), 500

    # Exam Management
    @app.route('/api/admin/exams', methods=['GET'])
    @admin_required
    def get_admin_exams():
        """Gets a list of all exams (basic details)."""
        try:
            # Eager load assigned groups count if needed often, else query separately or use relationship count
            exams = Exam.query.order_by(Exam.created_at.desc()).all()
            # Note: exam.to_dict now calculates question_count
            return jsonify([exam.to_dict(include_questions=False, include_groups=False) for exam in exams])
        except Exception as e:
            app.logger.exception(f"Error fetching admin exams list: {e}")
            return jsonify({"message": "An internal server error occurred while fetching exams."}), 500

    @app.route('/api/admin/exams', methods=['POST'])
    @admin_required
    def create_exam():
        """Creates a new exam with questions and optional group assignments."""
        data = request.get_json()
        # Validation
        required_fields = ['name', 'subject', 'duration', 'status', 'allowed_attempts', 'questions']
        if not data or not all(field in data for field in required_fields):
            missing = [field for field in required_fields if field not in data]
            return jsonify({"message": f"Missing required exam fields: {', '.join(missing)}."}), 400

        if not data.get('name') or not isinstance(data['name'], str): return jsonify({"message": "Invalid or missing exam name."}), 400
        # Allow subject to be optional or handle missing
        if 'subject' in data and not isinstance(data['subject'], str): return jsonify({"message": "Invalid subject type."}), 400

        try: duration = int(data['duration'])
        except (ValueError, TypeError): return jsonify({"message": "Duration must be an integer."}), 400
        if duration <= 0: return jsonify({"message": "Duration must be positive."}), 400

        try: allowed_attempts = int(data['allowed_attempts'])
        except (ValueError, TypeError): return jsonify({"message": "Allowed attempts must be an integer."}), 400
        if allowed_attempts <= 0: return jsonify({"message": "Allowed attempts must be positive."}), 400

        try: status_enum = ExamStatusEnum(data['status'])
        except ValueError: return jsonify({"message": f"Invalid status value: '{data['status']}'. Valid are: {[s.value for s in ExamStatusEnum]}"}), 400

        assigned_group_ids = data.get('assigned_group_ids', [])
        if not isinstance(assigned_group_ids, list): return jsonify({"message": "assigned_group_ids must be a list."}), 400
        # Validate group IDs are integers if provided
        if any(not isinstance(gid, int) for gid in assigned_group_ids): return jsonify({"message": "assigned_group_ids must contain only integers."}), 400

        questions_data = data.get('questions', [])
        if not isinstance(questions_data, list) or not questions_data:
            return jsonify({"message": "Exam must contain at least one question in a list format."}), 400

        # Database Operations
        try:
            new_exam = Exam(
                name=data['name'].strip(),
                subject=data.get('subject', '').strip(), # Handle optional subject
                duration=duration,
                status=status_enum,
                allowed_attempts=allowed_attempts
            )

            # Assign Groups if IDs provided
            if assigned_group_ids:
                groups_to_assign = UserGroup.query.filter(UserGroup.id.in_(assigned_group_ids)).all()
                if len(groups_to_assign) != len(set(assigned_group_ids)):
                    found_ids = {g.id for g in groups_to_assign}
                    missing_ids = [gid for gid in set(assigned_group_ids) if gid not in found_ids]
                    db.session.rollback() # Rollback before returning error
                    return jsonify({"message": f"Could not find groups with IDs: {missing_ids}."}), 404
                new_exam.assigned_groups.extend(groups_to_assign)

            db.session.add(new_exam)
            # Flush here to get the new_exam.id needed for questions
            db.session.flush()
            app.logger.info(f"Flushed new Exam, ID assigned: {new_exam.id}")

            # Add Questions
            for idx, q_data in enumerate(questions_data):
                if not isinstance(q_data, dict): raise ValueError(f"Question data at index {idx} must be a dictionary.")
                q_req = ['text', 'options', 'correct_answer']
                if not all(f in q_data and q_data[f] is not None for f in q_req): raise ValueError(f"Missing required fields in question at index {idx}: text, options, correct_answer.")

                text = q_data['text'].strip()
                options = q_data['options']
                correct_answer = str(q_data['correct_answer']).strip()

                if not text: raise ValueError(f"Question text cannot be empty (index {idx}).")
                if not isinstance(options, list) or len(options) < 2: raise ValueError(f"Question options must be a list with at least 2 items (index {idx}).")
                if not correct_answer: raise ValueError(f"Correct answer cannot be empty (index {idx}).")

                # Validate options list contains strings and correct answer is one of them
                valid_options = [str(opt).strip() for opt in options if str(opt).strip()]
                if len(valid_options) < 2: raise ValueError(f"Question must have at least 2 non-empty options (index {idx}).")
                if correct_answer not in valid_options: raise ValueError(f"Correct answer '{correct_answer}' not found in options {valid_options} (index {idx}).")

                new_question = Question(
                    exam_id=new_exam.id, # Use the flushed ID
                    text=text,
                    options=valid_options, # Use the validated/cleaned list
                    correct_answer=correct_answer
                )
                db.session.add(new_question)

            # Commit everything if all successful
            db.session.commit()
            app.logger.info(f"Exam '{new_exam.name}' (ID: {new_exam.id}) created successfully with {len(questions_data)} questions.")
            # Return the created exam data, including questions and groups
            return jsonify(new_exam.to_dict(include_questions=True, include_groups=True)), 201

        except (ValueError, TypeError, KeyError) as ve: # Catch data validation errors
            db.session.rollback()
            app.logger.warning(f"Invalid data provided for exam creation: {ve}")
            return jsonify({"message": f"Invalid data provided: {ve}"}), 400
        except IntegrityError as ie:
            db.session.rollback()
            app.logger.error(f"Database integrity error during exam creation: {ie}", exc_info=True)
            # Provide a more generic message unless you know the specific constraint (e.g., unique name)
            return jsonify({"message": "Database error during creation (e.g., constraint violation)."}), 409
        except Exception as e:
            db.session.rollback()
            app.logger.exception(f"Unexpected error creating exam: {e}")
            return jsonify({"message":"Internal server error creating exam."}), 500

    @app.route('/api/admin/exams/<int:exam_id>/import_csv', methods=['POST'])
    @admin_required
    def import_questions_from_csv(exam_id):
        """Imports questions from a CSV file for a specific exam."""
        if pd is None:
             app.logger.error("Attempted CSV import, but pandas library is not installed.")
             return jsonify({"message": "CSV import feature is disabled because the 'pandas' library is not installed."}), 501 # Not Implemented

        exam = db.session.get(Exam, exam_id)
        if not exam: return jsonify({"message": "Exam not found"}), 404

        if 'file' not in request.files: return jsonify({"message": "No file part in the request"}), 400
        file = request.files['file']
        if not file or file.filename == '': return jsonify({"message": "No selected file"}), 400

        if file and file.filename.lower().endswith('.csv'):
            try:
                # Use UTF-8-sig to handle potential BOM (Byte Order Mark)
                stream = io.StringIO(file.stream.read().decode("utf-8-sig"), newline=None)
                df = pd.read_csv(stream, skipinitialspace=True) # Skip leading whitespace in headers/data

                required_columns = ['question', 'option1', 'option2', 'option3', 'option4', 'correct_answer']
                # Normalize column names from CSV (lower, strip)
                df.columns = [col.lower().strip() for col in df.columns]
                actual_headers = df.columns.tolist()

                missing_headers = [col for col in required_columns if col not in actual_headers]
                if missing_headers:
                    return jsonify({"message": f"CSV file is missing required columns: {', '.join(missing_headers)}"}), 400

                # Append strategy
                new_questions = []
                errors = []
                for index, row in df.iterrows():
                    try:
                        # Access row data using normalized column names, handle potential missing data gracefully
                        question_text = str(row.get('question', '')).strip()
                        # Collect options, handling potential NaN values from pandas
                        options = [str(row.get(f'option{i}', '')).strip() for i in range(1, 5) if pd.notna(row.get(f'option{i}')) and str(row.get(f'option{i}', '')).strip()]
                        correct_answer_text = str(row.get('correct_answer', '')).strip()

                        # Validate row data
                        if not question_text: errors.append(f"Row {index + 2}: Question text is empty."); continue
                        if len(options) < 2 : errors.append(f"Row {index + 2}: At least two non-empty options are required."); continue
                        if not correct_answer_text: errors.append(f"Row {index + 2}: Correct answer is empty."); continue
                        if correct_answer_text not in options: errors.append(f"Row {index + 2}: Correct answer '{correct_answer_text}' not found in provided options {options}."); continue

                        # Create Question object but don't add to session yet
                        new_q = Question(exam_id=exam.id, text=question_text, options=options, correct_answer=correct_answer_text)
                        new_questions.append(new_q)

                    except Exception as row_error:
                        # Catch potential errors during data processing for a row
                        errors.append(f"Row {index + 2}: Error processing - {row_error}")
                        continue # Skip this row

                # If any errors occurred during row processing, rollback and report
                if errors:
                    db.session.rollback() # Ensure no partial adds
                    app.logger.warning(f"CSV import failed for exam {exam_id} due to row errors:\n" + "\n".join(errors))
                    return jsonify({"message": "Import failed due to errors in some rows.", "errors": errors}), 400
                else:
                    # If all rows processed without errors, add all new questions and commit
                    if not new_questions:
                         return jsonify({"message": "No valid questions found in the CSV file to import."}), 400

                    db.session.add_all(new_questions)
                    db.session.commit()
                    app.logger.info(f"Successfully imported {len(new_questions)} questions via CSV for exam {exam_id}.")
                    return jsonify({"message": f"Successfully imported {len(new_questions)} questions for exam '{exam.name}'."}), 201

            except pd.errors.EmptyDataError:
                return jsonify({"message": "CSV file is empty or contains only headers."}), 400
            except UnicodeDecodeError:
                 db.session.rollback()
                 app.logger.warning(f"CSV file for exam {exam_id} is not valid UTF-8.")
                 return jsonify({"message": "Invalid file encoding. Please ensure the CSV file is saved as UTF-8."}), 400
            except Exception as e:
                db.session.rollback()
                app.logger.exception(f"Error importing CSV for exam {exam_id}: {e}")
                return jsonify({"message": f"An error occurred during CSV processing: {e}"}), 500
        else:
            return jsonify({"message": "Invalid file type. Please upload a CSV file."}), 400

    @app.route('/api/admin/exams/<int:exam_id>', methods=['GET'])
    @admin_required
    def get_exam(exam_id):
        """Gets details for a specific exam, including questions and assigned groups."""
        app.logger.info(f"Admin request: Fetching details for exam ID: {exam_id}")
        try:
            # Use session.get with joinedload options
            # selectinload might be better for one-to-many (questions) if needed later
            exam = db.session.get(Exam, exam_id, options=[
            # db.joinedload(Exam.questions),
            joinedload(Exam.assigned_groups)
            ])

            if not exam:
                app.logger.warning(f"Admin request: Exam with ID {exam_id} not found.")
                return jsonify({"message": "Exam not found"}), 404

            app.logger.info(f"Admin request: Found exam '{exam.name}'. Serializing...")
            # The robustness is now primarily within the to_dict method
            exam_dict = exam.to_dict(include_questions=True, include_groups=True)
            app.logger.info(f"Admin request: Serialization successful for exam {exam_id}.")
            return jsonify(exam_dict)

        except Exception as e:
            # Catch unexpected errors during query or serialization
            app.logger.exception(f"Error fetching exam {exam_id} details: {e}")
            return jsonify({"message": "Internal server error while fetching exam details."}), 500


    @app.route('/api/admin/exams/<int:exam_id>', methods=['PUT'])
    @admin_required
    def update_exam(exam_id):
        """Updates an existing exam, its questions, and group assignments."""
        # Load the exam and its current group assignments
        exam = db.session.get(Exam, exam_id, options=[joinedload(Exam.assigned_groups)])
        if not exam:
            return jsonify({"message": "Exam not found"}), 404

        data = request.get_json()
        # Basic validation of incoming data structure
        required_fields = ['name', 'subject', 'duration', 'status', 'allowed_attempts', 'questions']
        if not data or not all(field in data for field in required_fields):
             missing = [field for field in required_fields if field not in data]
             return jsonify({"message": f"Missing required exam fields for update: {', '.join(missing)}."}), 400

        assigned_group_ids = data.get('assigned_group_ids', [])
        if not isinstance(assigned_group_ids, list) or any(not isinstance(gid, int) for gid in assigned_group_ids):
            return jsonify({"message": "assigned_group_ids must be a list of integers."}), 400

        # Validate individual fields
        try:
            attempts = int(data['allowed_attempts'])
            duration = int(data['duration'])
            if attempts <= 0 or duration <= 0: raise ValueError("Attempts and duration must be positive.")
            status_enum = ExamStatusEnum(data['status'])
            name = data['name'].strip()
            subject = data.get('subject', '').strip() # Handle optional subject
            if not name: raise ValueError("Exam name cannot be empty.")

            questions_data = data.get('questions', [])
            if not isinstance(questions_data, list) or not questions_data:
                 raise ValueError("Exam must contain at least one question in a list format.")

            # Update exam attributes
            exam.name = name
            exam.subject = subject
            exam.duration = duration
            exam.status = status_enum
            exam.allowed_attempts = attempts

            # Update Group Assignments
            # Efficiently update many-to-many: replace current groups with new set
            current_group_ids = {group.id for group in exam.assigned_groups}
            new_group_ids = set(assigned_group_ids)

            # Find groups to add and remove
            ids_to_add = new_group_ids - current_group_ids
            ids_to_remove = current_group_ids - new_group_ids

            if ids_to_remove:
                 groups_to_remove = UserGroup.query.filter(UserGroup.id.in_(ids_to_remove)).all()
                 for group in groups_to_remove: exam.assigned_groups.remove(group)

            if ids_to_add:
                 groups_to_add = UserGroup.query.filter(UserGroup.id.in_(ids_to_add)).all()
                 if len(groups_to_add) != len(ids_to_add): # Check if all requested IDs were found
                     found_ids = {g.id for g in groups_to_add}
                     missing_ids = ids_to_add - found_ids
                     db.session.rollback()
                     return jsonify({"message": f"Cannot assign groups: Groups with IDs {list(missing_ids)} not found."}), 404
                 exam.assigned_groups.extend(groups_to_add)

            # Update Questions (Delete existing and Re-add new strategy)
            # This is simple but might be inefficient for large numbers of questions.
            # Consider an update-in-place strategy if performance becomes an issue.
            app.logger.info(f"Deleting existing questions for exam {exam_id} before update.")
            # Use the relationship with cascade delete-orphan if configured, or explicit delete
            # Since cascade is set on model, this should work:
            exam.questions.delete() # Deletes questions linked via the dynamic relationship
            # If cascade didn't work reliably, use:
            # Question.query.filter_by(exam_id=exam_id).delete()
            db.session.flush() # Ensure deletes happen before adds

            app.logger.info(f"Adding updated questions for exam {exam_id}.")
            new_questions = []
            for idx, q_data in enumerate(questions_data):
                 # Re-validate question data similar to create_exam
                 if not isinstance(q_data, dict): raise ValueError(f"Question data at index {idx} must be a dictionary.")
                 q_req = ['text', 'options', 'correct_answer']
                 if not all(f in q_data and q_data[f] is not None for f in q_req): raise ValueError(f"Missing required fields in question at index {idx}.")
                 text = q_data['text'].strip(); options = q_data['options']; correct_answer = str(q_data['correct_answer']).strip()
                 if not text: raise ValueError(f"Question text empty (index {idx}).")
                 if not isinstance(options, list) or len(options) < 2: raise ValueError(f"Invalid options (index {idx}).")
                 if not correct_answer: raise ValueError(f"Correct answer empty (index {idx}).")
                 valid_options = [str(opt).strip() for opt in options if str(opt).strip()]
                 if len(valid_options) < 2: raise ValueError(f"Need >= 2 non-empty options (index {idx}).")
                 if correct_answer not in valid_options: raise ValueError(f"Correct answer '{correct_answer}' not in options {valid_options} (index {idx}).")

                 nq = Question(exam_id=exam.id, text=text, options=valid_options, correct_answer=correct_answer)
                 new_questions.append(nq) # Add to list first

            db.session.add_all(new_questions) # Bulk add

            db.session.commit()
            app.logger.info(f"Exam '{exam.name}' (ID: {exam_id}) updated successfully with {len(new_questions)} questions.")
            # Return updated exam, including new questions/groups
            return jsonify(exam.to_dict(include_questions=True, include_groups=True))

        except (ValueError, TypeError, KeyError) as ve:
            db.session.rollback()
            app.logger.warning(f"Invalid data provided for exam update (ID: {exam_id}): {ve}")
            return jsonify({"message": f"Invalid data provided: {ve}"}), 400
        except IntegrityError as ie:
             db.session.rollback()
             app.logger.error(f"Database integrity error during exam update (ID: {exam_id}): {ie}", exc_info=True)
             return jsonify({"message": "Database error: Could not update exam (e.g., constraint violation)."}), 409
        except Exception as e:
            db.session.rollback()
            app.logger.exception(f"Error updating exam {exam_id}: {e}")
            return jsonify({"message":"Internal server error updating exam."}), 500


    @app.route('/api/admin/exams/<int:exam_id>', methods=['DELETE'])
    @admin_required
    def delete_exam(exam_id):
        """Deletes an exam and its associated questions/submissions/assignments."""
        exam = db.session.get(Exam, exam_id)
        if not exam:
            return jsonify({"message": "Exam not found"}), 404
        try:
            exam_name = exam.name
            # Cascading deletes configured in models.py should handle related items
            db.session.delete(exam)
            db.session.commit()
            app.logger.info(f"Exam '{exam_name}' (ID: {exam_id}) deleted successfully.")
            return jsonify({"message": f"Exam '{exam_name}' deleted successfully"}), 200
        except Exception as e:
            db.session.rollback()
            app.logger.exception(f"Error deleting exam {exam_id}: {e}")
            return jsonify({"message":"Internal server error deleting exam."}), 500

    # Exam Results
    @app.route('/api/admin/exams/<int:exam_id>/results', methods=['GET'])
    @admin_required
    def get_exam_results(exam_id):
        """Gets results (submissions) for a specific exam."""
        app.logger.info(f"Admin request: Fetching results for exam ID: {exam_id}")
        # Check if exam exists first (optional, but good practice)
        exam_exists = db.session.query(Exam.id).filter_by(id=exam_id).first()
        if not exam_exists:
            app.logger.warning(f"Admin request: Exam not found when fetching results for ID {exam_id}.")
            return jsonify({"message": "Exam not found"}), 404
        try:
            # Eager load student and exam details for each submission using joinedload (defined in model)
            submissions = ExamSubmission.query.filter_by(exam_id=exam_id)\
                                               .order_by(ExamSubmission.submitted_at.desc())\
                                               .all()
            app.logger.info(f"Found {len(submissions)} submissions for exam {exam_id}. Serializing...")
            # The robustness is now mainly within ExamSubmission.to_dict()
            results = [sub.to_dict() for sub in submissions]
            app.logger.info(f"Serialization complete for exam {exam_id} results.")
            return jsonify(results), 200
        except Exception as e:
            # Log with exception info for detailed traceback
            app.logger.exception(f"Error fetching results for exam {exam_id}: {e}")
            return jsonify({"message": "An internal server error occurred while fetching results."}), 500

    # User Group Management (Code largely unchanged from previous versions, assuming it worked)
    # Add logging and minor validation improvements if needed

    @app.route('/api/admin/usergroups', methods=['POST'])
    @admin_required
    def create_user_group():
        data = request.get_json()
        group_name = data.get('name', '').strip()
        description = data.get('description', '').strip()
        if not group_name: return jsonify({"message": "Group name cannot be empty."}), 400
        try:
            new_group = UserGroup(name=group_name, description=description)
            db.session.add(new_group); db.session.commit()
            app.logger.info(f"Admin: User group '{group_name}' (ID: {new_group.id}) created.")
            return jsonify(new_group.to_dict()), 201
        except IntegrityError:
            db.session.rollback();
            app.logger.warning(f"Admin: Attempt to create duplicate group name: '{group_name}'")
            return jsonify({"message": f"Group name '{group_name}' already exists."}), 409
        except Exception as e:
            db.session.rollback();
            app.logger.exception(f"Admin: Error creating group '{group_name}': {e}");
            return jsonify({"message": "Internal error creating group."}), 500

    @app.route('/api/admin/usergroups', methods=['GET'])
    @admin_required
    def get_user_groups():
        try:
            groups = UserGroup.query.order_by(UserGroup.name).all()
            # Return more info if needed by frontend selector
            return jsonify([{'id': g.id, 'name': g.name, 'student_count': len(g.students)} for g in groups]), 200
        except Exception as e:
            app.logger.exception(f"Admin: Error fetching user groups list: {e}")
            return jsonify({"message": "Internal error fetching groups."}), 500

    @app.route('/api/admin/usergroups/<int:group_id>', methods=['GET'])
    @admin_required
    def get_user_group_details(group_id):
        try:
            # Use joinedload for students as defined in model if 'subquery' isn't sufficient
            group = db.session.get(UserGroup, group_id, options=[joinedload(UserGroup.students)])
            if not group: return jsonify({"message": "Group not found"}), 404
            return jsonify(group.to_dict(include_students=True)), 200
        except Exception as e:
            app.logger.exception(f"Admin: Error fetching details for group {group_id}: {e}")
            return jsonify({"message": "Internal error fetching group details."}), 500

    @app.route('/api/admin/usergroups/<int:group_id>', methods=['PUT'])
    @admin_required
    def update_user_group(group_id):
        group = db.session.get(UserGroup, group_id)
        if not group: return jsonify({"message": "Group not found"}), 404
        data = request.get_json(); updated = False
        if not data: return jsonify({"message": "No update data provided."}), 400
        try:
            new_name = data.get('name')
            new_desc = data.get('description') # Allow description to be set to empty string

            if new_name is not None:
                new_name = new_name.strip()
                if not new_name: return jsonify({"message": "Group name cannot be empty."}), 400
                if new_name != group.name:
                    # Check case-insensitive duplicate?
                    existing = UserGroup.query.filter(UserGroup.name.ilike(new_name), UserGroup.id != group_id).first()
                    if existing: return jsonify({"message": f"Group name '{new_name}' already exists."}), 409
                    group.name = new_name; updated = True

            # Update description if provided, even if it's empty
            if new_desc is not None:
                 new_desc_stripped = new_desc.strip()
                 if new_desc_stripped != (group.description or ''): # Compare with current value or empty string
                      group.description = new_desc_stripped; updated = True

            if not updated: return jsonify({"message": "No changes detected."}), 200 # Use 200 OK for no change

            db.session.commit()
            app.logger.info(f"Admin: User group '{group.name}' (ID: {group_id}) updated.")
            return jsonify(group.to_dict()), 200
        except IntegrityError: # Catch potential race condition on unique name
            db.session.rollback()
            app.logger.warning(f"Admin: IntegrityError updating group {group_id} to name '{new_name}'")
            return jsonify({"message": f"Group name '{new_name}' already exists."}), 409
        except Exception as e:
            db.session.rollback()
            app.logger.exception(f"Admin: Error updating group {group_id}: {e}")
            return jsonify({"message": "Internal error updating group."}), 500

    @app.route('/api/admin/usergroups/<int:group_id>', methods=['DELETE'])
    @admin_required
    def delete_user_group(group_id):
        group = db.session.get(UserGroup, group_id)
        if not group: return jsonify({"message": "Group not found"}), 404
        try:
            group_name = group.name
            # Cascade deletes should handle memberships/assignments if configured
            db.session.delete(group); db.session.commit()
            app.logger.info(f"Admin: User group '{group_name}' (ID: {group_id}) deleted.")
            return jsonify({"message": f"Group '{group_name}' deleted successfully"}), 200
        except Exception as e:
            db.session.rollback()
            app.logger.exception(f"Admin: Error deleting group {group_id}: {e}")
            return jsonify({"message": "Internal error deleting group."}), 500

    @app.route('/api/admin/usergroups/<int:group_id>/students', methods=['POST'])
    @admin_required
    def add_student_to_group(group_id):
        # Load group with students to check existence and return updated list
        group = db.session.get(UserGroup, group_id, options=[joinedload(UserGroup.students)])
        if not group: return jsonify({"message": "Group not found"}), 404

        data = request.get_json()
        student_id = data.get('student_id')
        if not student_id: return jsonify({"message": "student_id is required."}), 400
        try: student_id = int(student_id)
        except (ValueError, TypeError): return jsonify({"message": "Invalid student_id format (must be an integer)."}), 400

        student = db.session.get(User, student_id)
        if not student or student.role != RoleEnum.STUDENT: return jsonify({"message": "Student not found or user is not a student."}), 404

        if student in group.students: return jsonify({"message": f"Student '{student.username}' is already in group '{group.name}'."}), 409 # Conflict

        try:
            group.students.append(student); db.session.commit()
            app.logger.info(f"Admin: Student '{student.username}' (ID: {student_id}) added to group '{group.name}' (ID: {group_id}).")
            # Return updated group details
            return jsonify({ "message": f"Student '{student.username}' added to group '{group.name}'.", "group": group.to_dict(include_students=True) }), 200
        except Exception as e:
            db.session.rollback()
            app.logger.exception(f"Admin: Error adding student {student_id} to group {group_id}: {e}")
            return jsonify({"message": "Internal server error adding student."}), 500

    @app.route('/api/admin/usergroups/<int:group_id>/students/<int:student_id>', methods=['DELETE'])
    @admin_required
    def remove_student_from_group(group_id, student_id):
        # Load group with students to perform removal
        group = db.session.get(UserGroup, group_id, options=[joinedload(UserGroup.students)])
        if not group: return jsonify({"message": "Group not found"}), 404

        student = db.session.get(User, student_id)
        if not student: return jsonify({"message": "Student not found"}), 404 # Should still check student exists

        # Check if student is actually in the group before attempting removal
        if student not in group.students: return jsonify({"message": f"Student '{student.username}' is not in group '{group.name}'."}), 404 # Not Found in group

        try:
            group.students.remove(student); db.session.commit()
            app.logger.info(f"Admin: Student '{student.username}' (ID: {student_id}) removed from group '{group.name}' (ID: {group_id}).")
             # Return updated group details
            return jsonify({ "message": f"Student '{student.username}' removed from group '{group.name}'.", "group": group.to_dict(include_students=True) }), 200
        except Exception as e:
            db.session.rollback()
            app.logger.exception(f"Admin: Error removing student {student_id} from group {group_id}: {e}")
            return jsonify({"message": "Internal server error removing student."}), 500

    # Helper route to get list of students (for admin selectors)
    @app.route('/api/admin/students', methods=['GET'])
    @admin_required
    def get_all_students():
        """Gets a list of all users with the STUDENT role (id, username)."""
        try:
            students = User.query.filter_by(role=RoleEnum.STUDENT).order_by(User.username).all()
            return jsonify([{'id': s.id, 'username': s.username} for s in students]), 200
        except Exception as e:
            app.logger.exception(f"Admin: Error fetching student list: {e}")
            return jsonify({"message": "Internal server error fetching students."}), 500


    # --- Student Routes ---
    @app.route('/api/student/exams/available', methods=['GET'])
    @student_required
    def get_student_available_exams():
        """Gets exams available to the current student including previous submission summaries."""
        student = g.current_user
        app.logger.info(f"Student {student.id}: Fetching available exams with history.")
        try: # <-- AWAL BLOK TRY
            # Get IDs of groups the student belongs to
            student_group_ids = {group.id for group in student.groups}
            app.logger.debug(f"Student {student.id} belongs to group IDs: {student_group_ids}")

            # Query for published exams relevant to the student
            query = Exam.query.filter(Exam.status == ExamStatusEnum.PUBLISHED)\
                              .outerjoin(Exam.assigned_groups)\
                              .filter(
                                  (Exam.assigned_groups == None) | \
                                  (UserGroup.id.in_(student_group_ids))
                              ).distinct()

            available_exams = query.order_by(Exam.created_at.desc()).all()
            app.logger.info(f"Found {len(available_exams)} available exams for student {student.id}.")

            results = [] # Pindahkan inisialisasi results ke dalam try

            # --- Loop HARUS di dalam try ---
            for exam in available_exams:
                # Konversi exam dasar ke dictionary
                exam_data = exam.to_dict(include_questions=False, include_groups=False)

                # Hitung total attempts
                # Pastikan query ini tidak error jika exam.id null (seharusnya tidak mungkin di sini)
                attempts_taken_count = ExamSubmission.query.filter_by(user_id=student.id, exam_id=exam.id).count()
                exam_data['attempts_taken'] = attempts_taken_count
                # Perbandingan attempts (pastikan allowed_attempts ada di exam_data atau exam object)
                # Ambil allowed_attempts dari exam object langsung untuk keamanan
                exam_data['can_attempt'] = attempts_taken_count < exam.allowed_attempts

                # Ambil Detail Submission Sebelumnya
                previous_submissions_query = ExamSubmission.query.filter_by(user_id=student.id, exam_id=exam.id)\
                                                            .order_by(ExamSubmission.submitted_at.asc())\
                                                            .all()

                # Format data submission sebelumnya
                exam_data['previous_submissions'] = [] # Inisialisasi list kosong
                if attempts_taken_count > 0 and previous_submissions_query: # Cek jika ada attempt dan query mengembalikan hasil
                    app.logger.debug(f"Processing {len(previous_submissions_query)} submissions for exam {exam.id}, student {student.id}")
                    for sub in previous_submissions_query:
                        # Buat dictionary untuk setiap submission
                        submission_summary = {
                            'submissionId': sub.id,
                            'submittedAt': sub.submitted_at.isoformat() if sub.submitted_at else None,
                            'score': sub.score,
                            'correctAnswers': sub.correct_answers_count,
                            'totalQuestions': sub.total_questions_count
                        }
                        exam_data['previous_submissions'].append(submission_summary)
                # else: # Tidak perlu log jika memang tidak ada submission
                    # app.logger.debug(f"No previous submissions found for exam {exam.id}, student {student.id}")

                # Tambahkan data ujian yang sudah dilengkapi ke hasil akhir
                results.append(exam_data)
            # --- Akhir Loop ---

            # Logging sebelum return (tetap di dalam try)
            app.logger.debug(f"Sending available exams with submission history (count: {len(results)}). First item snippet: {str(results[0])[:200] if results else 'None'}")
            return jsonify(results)

        except Exception as e: # <-- AKHIR BLOK TRY, AWAL BLOK EXCEPT
            db.session.rollback() # Rollback jika ada error selama proses
            app.logger.exception(f"Error fetching available exams with history for student {student.id}: {e}")
            # Kembalikan pesan error dan status 500
            return jsonify({"message": "Error fetching available exams."}), 500

    @app.route('/api/student/exams/<int:exam_id>/take', methods=['GET'])
    @student_required
    def get_exam_for_student(exam_id):
        """Gets specific exam details for a student to take, ensuring eligibility."""
        student = g.current_user
        app.logger.info(f"Student {student.id}: Attempting to 'take' exam {exam_id}.")

        try:
            # Eager load questions and assigned groups
            exam = db.session.get(Exam, exam_id, options=[
                selectinload(Exam.questions), # selectinload for one-to-many
                joinedload(Exam.assigned_groups) # subquery for many-to-many
            ])

            if not exam: return jsonify({"message": "Exam not found."}), 404
            if exam.status != ExamStatusEnum.PUBLISHED:
                 app.logger.warning(f"Student {student.id} attempt to take non-published exam {exam_id} (Status: {exam.status.value}).")
                 return jsonify({"message": "This exam is not currently available."}), 403 # Forbidden

            # Check Group Assignment
            if exam.assigned_groups: # Only check if exam IS assigned to groups
                student_group_ids = {group.id for group in student.groups}
                exam_group_ids = {group.id for group in exam.assigned_groups}
                if not student_group_ids.intersection(exam_group_ids):
                    app.logger.warning(f"Student {student.id} ({student_group_ids}) attempt to take exam {exam_id} assigned to groups {exam_group_ids}.")
                    return jsonify({"message": "You are not assigned to take this exam."}), 403 # Forbidden

            # Check Attempts Left
            attempts_taken = ExamSubmission.query.filter_by(user_id=student.id, exam_id=exam_id).count()
            if attempts_taken >= exam.allowed_attempts:
                 app.logger.warning(f"Student {student.id} attempt to take exam {exam_id}: Max attempts ({exam.allowed_attempts}) already reached.")
                 return jsonify({"message": f"You have already used all {exam.allowed_attempts} attempt(s) for this exam."}), 403 # Forbidden

            # Prepare exam data (remove correct answers)
            exam_data = exam.to_dict(include_questions=True, include_groups=False) # Get questions
            if 'questions' in exam_data:
                for q in exam_data['questions']:
                    q.pop('correct_answer', None) # Remove sensitive info

            # Initialize Proctoring State (if enabled)
            try:
                 proctoring.initialize_proctoring_state(student.id)
                 app.logger.info(f"Student {student.id} starting exam {exam_id}. Proctoring initialized.")
            except Exception as proc_e:
                 app.logger.error(f"Failed to initialize proctoring for student {student.id}, exam {exam_id}: {proc_e}", exc_info=True)
                 # Decide if this should prevent the exam from starting
                 # return jsonify({"message": "Could not initialize proctoring session. Please try again."}), 500

            return jsonify(exam_data)

        except Exception as e:
             app.logger.exception(f"Error fetching exam {exam_id} for student {student.id}: {e}")
             return jsonify({"message": "Error retrieving exam details."}), 500

    @app.route('/api/student/exams/<int:exam_id>/submit', methods=['POST'])
    @student_required
    def submit_exam_answers(exam_id):
        """Handles the submission of exam answers by a student, calculates score, saves submission, and logs notification."""
        data = request.get_json()
        student = g.current_user
        user_id = student.id
        username = student.username # Ambil username untuk log

        app.logger.info(f"Submission received: Exam {exam_id}, User {user_id} ({username})")

        # 1. Validasi Input Dasar
        if not data or 'answers' not in data or not isinstance(data['answers'], dict):
            app.logger.warning(f"Invalid submission payload for Exam {exam_id}, User {user_id}: Missing or invalid 'answers'.")
            return jsonify({"message": "Missing or invalid 'answers' data (must be a dictionary)."}), 400

        student_answers = data['answers'] # Format: { "question_id_str": "selected_option_text", ... }
        app.logger.debug(f"User {user_id} answers (keys only): {list(student_answers.keys())}")

        try:
            # 2. Fetch Ujian dan Pertanyaan (Penting untuk Grading & Info Notifikasi)
            # Eager load questions untuk efisiensi grading
            exam = db.session.get(Exam, exam_id, options=[selectinload(Exam.questions)])
            if not exam:
                 app.logger.warning(f"Submission failed: Exam {exam_id} not found for User {user_id}.")
                 return jsonify({"message": "Exam not found."}), 404

            # 3. Cek Kelayakan Submit Ulang (Status Ujian & Attempts)
            if exam.status != ExamStatusEnum.PUBLISHED:
                 app.logger.warning(f"Submission rejected: Exam {exam_id} (User {user_id}) is not published (Status: {exam.status.value}).")
                 return jsonify({"message": "This exam is not currently available for submission."}), 403

            # Re-check jumlah attempt TEPAT SEBELUM menyimpan untuk mencegah race condition
            attempts_taken = ExamSubmission.query.filter_by(user_id=user_id, exam_id=exam_id).count()
            if attempts_taken >= exam.allowed_attempts:
                app.logger.warning(f"Submission rejected (Race Condition?): User {user_id}, Exam {exam_id}: Max attempts ({exam.allowed_attempts}) already reached ({attempts_taken} found).")
                return jsonify({"message": f"Maximum number of attempts ({exam.allowed_attempts}) already reached."}), 403

            app.logger.info(f"Processing attempt {attempts_taken + 1}/{exam.allowed_attempts} for User {user_id}, Exam {exam_id} ('{exam.name}')")

            # 4. Kalkulasi Skor
            questions_list = exam.questions.all() # Ambil semua pertanyaan dari relasi
            total_questions = len(questions_list) if questions_list else 0
            correct_answers_count = 0
            calculated_score = 0.0

            if total_questions > 0:
                # Buat map jawaban benar {string(question_id): correct_answer_text}
                question_map = {str(q.id): q.correct_answer for q in questions_list}

                # Bandingkan jawaban siswa dengan jawaban benar
                for q_id_str, correct_ans_text in question_map.items():
                    student_ans_text = student_answers.get(q_id_str) # Ambil jawaban siswa (bisa None)
                    # Lakukan perbandingan yang aman (handle None, konversi ke string, trim whitespace)
                    if student_ans_text is not None and correct_ans_text is not None and \
                       str(student_ans_text).strip() == str(correct_ans_text).strip():
                        correct_answers_count += 1

                # Hitung skor persentase
                calculated_score = round((correct_answers_count / total_questions) * 100.0, 2)
                app.logger.info(f"Score calculated for User {user_id}, Exam {exam_id}: {calculated_score}% ({correct_answers_count}/{total_questions})")
            else:
                 app.logger.warning(f"Exam {exam_id} has no questions. Score set to 0.")


            # 5. Buat dan Simpan Record Submission
            new_submission = ExamSubmission(
                user_id=user_id,
                exam_id=exam_id,
                submitted_at=datetime.now(timezone.utc), # Gunakan waktu server UTC
                score=calculated_score,
                correct_answers_count=correct_answers_count,
                total_questions_count=total_questions, # Simpan jumlah soal saat submit
                answers=student_answers # Simpan jawaban siswa sebagai JSON
            )
            db.session.add(new_submission)
            # --- Commit Submission Utama ---
            try:
                 db.session.commit()
                 app.logger.info(f"Saved submission ID: {new_submission.id} for User {user_id}, Exam {exam_id}")
            except Exception as commit_err:
                 db.session.rollback() # Rollback jika commit gagal
                 app.logger.exception(f"Database commit error during submission for User {user_id}, Exam {exam_id}: {commit_err}")
                 return jsonify({"message": "Database error saving submission."}), 500


            # --- 6. Buat Log Notifikasi (SETELAH submission utama berhasil commit) ---
            try:
                # Ambil nama subjek dari objek exam yang sudah di-fetch
                subject_name = exam.subject if exam and exam.subject else 'N/A'
                # Buat pesan notifikasi yang deskriptif
                log_message = f"'{username}' scored {calculated_score:.2f}% on exam '{exam.name}' ({subject_name})."

                notification = NotificationLog(
                    type=NotificationType.EXAM_SUBMITTED,
                    message=log_message,        # Pesan untuk ditampilkan
                    user_id=user_id,            # Siapa yang submit
                    exam_id=exam_id,            # Ujian apa
                    details={                   # Data JSON tambahan
                        'score': calculated_score,
                        'correctAnswers': correct_answers_count,
                        'totalQuestions': total_questions,
                        'submissionId': new_submission.id # Link ke submission jika perlu
                    }
                )
                db.session.add(notification)
                db.session.commit() # Commit notifikasi
                app.logger.info(f"Created EXAM_SUBMITTED notification log (ID: {notification.id}) for submission {new_submission.id}")
            except Exception as log_err:
                # Jika GAGAL membuat log, JANGAN gagalkan seluruh proses submit
                # Cukup log errornya saja
                db.session.rollback() # Rollback HANYA jika commit notifikasi gagal
                app.logger.error(f"Failed to create notification log for submission {new_submission.id}: {log_err}", exc_info=True)
            # --- *** AKHIR LOGIKA NOTIFIKASI *** ---


            # 7. Clear Proctoring State (jika ada)
            try:
                 proctoring.clear_proctoring_state(user_id)
                 app.logger.info(f"Cleared proctoring state for User {user_id}")
            except Exception as proc_e:
                 app.logger.error(f"Error clearing proctoring state for user {user_id} after submission: {proc_e}", exc_info=True)


            # 8. Kirim Respons Sukses ke Frontend
            # Sertakan data yang mungkin berguna untuk halaman hasil
            return jsonify({
                "message": "Exam submitted successfully.",
                "submissionId": new_submission.id,
                "correctAnswers": correct_answers_count,
                "totalQuestions": total_questions,
                "score": calculated_score
                # Anda BISA tambahkan data lain di sini jika tidak mau pakai state navigation
                # "examName": exam.name,
                # "submittedAt": new_submission.submitted_at.isoformat()
            }), 200

        # --- Error Handling untuk Keseluruhan Proses ---
        except IntegrityError as ie:
            db.session.rollback()
            app.logger.exception(f"Database integrity error during submission User {user_id}, Exam {exam_id}: {ie}")
            return jsonify({"message": "Database error during submission. Please try again."}), 500
        except Exception as e:
            db.session.rollback() # Pastikan rollback jika ada error tak terduga
            app.logger.exception(f"Unexpected Submission Error User {user_id}, Exam {exam_id}: {e}")
            return jsonify({"message": "An internal server error occurred during exam submission."}), 500


    @app.route('/api/student/exams/<int:exam_id>/submissions', methods=['GET']) # <-- URL baru (plural)
    @student_required
    def get_exam_submissions_history(exam_id):
        """Gets all submission history for a specific exam by the logged-in student, plus exam details."""
        student_id = g.current_user.id
        app.logger.info(f"Student {student_id}: Fetching submission history and exam details for exam {exam_id}")

        # Ambil detail ujian (nama, allowed_attempts, dll)
        exam = db.session.get(Exam, exam_id, options=[selectinload(Exam.questions)]) # Ambil questions untuk total
        if not exam:
            app.logger.warning(f"Student {student_id}: Exam not found when fetching history for ID {exam_id}.")
            return jsonify({"message": "Exam not found"}), 404

        try:
            # Ambil SEMUA submission untuk user dan exam ini, urutkan dari yang pertama
            submissions = ExamSubmission.query.filter_by(user_id=student_id, exam_id=exam_id)\
                                                .order_by(ExamSubmission.submitted_at.asc())\
                                                .all()

            app.logger.info(f"Student {student_id}: Found {len(submissions)} submissions for exam {exam_id}.")

            # Format data submission
            submissions_data = []
            for attempt_num, sub in enumerate(submissions):
                submissions_data.append({
                    'submissionId': sub.id,
                    'attemptNumber': attempt_num + 1, # Tambahkan nomor attempt
                    'correctAnswers': sub.correct_answers_count,
                    'totalQuestions': sub.total_questions_count, # Pastikan ini ada
                    'score': sub.score,
                    'submittedAt': sub.submitted_at.isoformat() if sub.submitted_at else None,
                    'status': "Finished" # Atau ambil dari DB jika ada field status per submission
                })

            # Siapkan data ujian
            exam_details_data = {
                "examId": exam.id,
                "examName": exam.name,
                "quizName": f"{exam.name} Results", # Sesuaikan jika perlu
                "attemptsAllowed": exam.allowed_attempts,
                # Hitung total pertanyaan dari relasi (lebih akurat daripada dari submission terakhir)
                "totalQuestionsOverall": len(exam.questions.all()) if exam.questions else 0,
                 # Kirim juga total attempt yang sudah diambil
                "attemptsTaken": len(submissions)
            }

            # Gabungkan dan kirim
            response_data = {
                "examDetails": exam_details_data,
                "submissions": submissions_data # Kirim array of submissions
            }
            return jsonify(response_data), 200

        except Exception as e:
            app.logger.exception(f"Error fetching submission history for student {student_id}, exam {exam_id}: {e}")
            return jsonify({"message": "Error retrieving submission history."}), 500
        
    pass 
        
    @app.route('/api/student/exams/<int:exam_id>/submission/latest', methods=['GET'])
    @student_required
    def get_latest_submission_for_exam(exam_id):
        """Gets the most recent submission details AND relevant exam details."""
        student_id = g.current_user.id
        app.logger.info(f"Student {student_id}: Fetching latest submission and exam details for exam {exam_id}")

        # 1. Ambil Detail Ujian TERLEBIH DAHULU
        # Eager load questions HANYA jika perlu hitung total di sini (lebih baik dari model exam)
        exam = db.session.get(Exam, exam_id, options=[selectinload(Exam.questions)])
        if not exam:
            app.logger.warning(f"Student {student_id}: Exam not found when fetching latest submission for ID {exam_id}.")
            return jsonify({"message": "Exam not found"}), 404

        try:
            # 2. Ambil Submission Terakhir (jika ada)
            latest_submission = ExamSubmission.query.filter_by(user_id=student_id, exam_id=exam_id)\
                                                .order_by(ExamSubmission.submitted_at.desc())\
                                                .first() # Hanya yang paling baru

            # 3. Hitung Jumlah Percobaan yang SUDAH DILAKUKAN (Total Submit)
            # Ini penting untuk kalkulasi sisa attempt di frontend
            # Lakukan query ini TERPISAH untuk mendapatkan jumlah terbaru
            attempts_taken_count = ExamSubmission.query.filter_by(user_id=student_id, exam_id=exam_id).count()
            app.logger.info(f"Total attempts counted for user {student_id}, exam {exam_id}: {attempts_taken_count}")

            # 4. Siapkan data detail ujian
            total_questions_overall = 0
            try:
                # Hitung total pertanyaan dari relasi Exam.questions
                 total_questions_overall = exam.questions.count() # Hitung dari relasi dinamis
                 app.logger.debug(f"Total questions counted from exam.questions relation: {total_questions_overall}")
            except Exception as q_err:
                 app.logger.warning(f"Could not count questions for exam {exam_id}: {q_err}")


            exam_details_data = {
                "examId": exam.id,
                "examName": exam.name,
                "quizName": f"{exam.name} Results", # Sesuaikan format nama jika perlu
                "attemptsAllowed": exam.allowed_attempts, # Nilai total dari DB
                "attemptsTaken": attempts_taken_count, # <-- SERTAKAN INI!
                "totalQuestionsOverall": total_questions_overall # Total soal dari ujian
                # Tambahkan subject, duration jika perlu ditampilkan di halaman hasil
                # "subject": exam.subject,
                # "duration": exam.duration
            }

            # 5. Siapkan data submission terakhir (jika ada)
            submission_details_data = None
            if latest_submission:
                app.logger.info(f"Student {student_id}: Found latest submission ID {latest_submission.id} for exam {exam_id}.")
                submission_details_data = {
                    'submissionId': latest_submission.id,
                    'correctAnswers': latest_submission.correct_answers_count,
                    # Total questions saat submit (bisa berbeda jika soal diedit), ambil dari submission
                    'totalQuestions': latest_submission.total_questions_count,
                    'score': latest_submission.score,
                    'submittedAt': latest_submission.submitted_at.isoformat() if latest_submission.submitted_at else None,
                    'answers': latest_submission.answers, # Kirim jika perlu untuk fitur review
                    'status': "Finished" # Asumsi status selesai
                }
            else:
                 app.logger.info(f"Student {student_id}: No submissions found for exam {exam_id}.")
                 # Jangan kirim 404 jika hanya submission yg tidak ada, kirim detail ujian saja

            # 6. Gabungkan dan Kirim Respons
            response_data = {
                "examDetails": exam_details_data,
                "submissionDetails": submission_details_data # Akan jadi null jika tidak ada submission
            }

            # Tentukan status code: 200 jika ada submission, tetap 200 (atau 200 dg pesan) jika hanya exam detail
            status_code = 200
            if not latest_submission:
                response_data["message"] = "Exam details loaded, but no submission found for this exam yet."
                # Anda bisa tetap return 200 atau return 404 jika mau (tapi frontend harus handle)
                # return jsonify(response_data), 404

            return jsonify(response_data), status_code

        except Exception as e:
            app.logger.exception(f"Error fetching latest submission/exam details for student {student_id}, exam {exam_id}: {e}")
            return jsonify({"message": "Error retrieving results."}), 500
        
    @app.route('/api/student/exams/<int:exam_id>/cancel', methods=['POST'])
    @student_required
    def cancel_exam_session(exam_id):
        student = g.current_user
        data = request.get_json()
        # Ambil alasan detail dari frontend, beri default jika tidak ada
        reason = data.get('reason', 'Proctoring violation detected')

        # Ambil detail ujian untuk dimasukkan ke pesan log
        exam = db.session.get(Exam, exam_id)
        if not exam:
            app.logger.warning(f"Cancellation log failed: Exam {exam_id} not found for user {student.id}")
            # Bisa return 404 atau log saja
            return jsonify({"message": "Exam not found, cancellation not logged."}), 404 # Mungkin lebih baik

        app.logger.warning(f"Received exam cancellation request for user {student.id}, exam {exam.id}. Reason: {reason}")

        try:
            # Buat pesan log notifikasi
            subject_name = exam.subject if exam else 'Unknown Subject'
            log_message = f"Exam '{exam.name}' ({subject_name}) for user '{student.username}' was cancelled. Reason: {reason}."

            notification = NotificationLog(
                type=NotificationType.EXAM_CANCELLED_PROCTORING,
                message=log_message, # Simpan pesan ini
                user_id=student.id,
                exam_id=exam_id,
                details={'reason': reason} # Simpan alasan detail
            )
            db.session.add(notification)
            db.session.commit()
            app.logger.info(f"Created EXAM_CANCELLED notification log for user {student.id}, exam {exam.id}")

            # Tambahan: Mungkin Anda ingin menandai submission yang sedang berjalan (jika ada) sebagai 'CANCELLED'?
            # Ini memerlukan logika tambahan untuk mencari submission aktif.

            return jsonify({"message": "Exam session cancellation logged successfully."}), 200
        except Exception as e:
            db.session.rollback()
            app.logger.exception(f"Error logging exam cancellation for user {student.id}, exam {exam.id}: {e}")
            return jsonify({"message": "Failed to log exam cancellation."}), 500
                

    @app.route('/api/admin/dashboard/notifications', methods=['GET'])
    @admin_required
    def get_recent_notifications():
        # Pastikan fungsi ini ada di bagian Admin Routes
        """Gets recent notification logs for the admin dashboard."""
        try:
            limit = request.args.get('limit', 15, type=int) # Ambil 15 terbaru
            notifications = NotificationLog.query.options(
                                joinedload(NotificationLog.user), # Eager load user
                                joinedload(NotificationLog.exam)  # Eager load exam
                            )\
                            .order_by(NotificationLog.timestamp.desc())\
                            .limit(limit)\
                            .all()

            # Gunakan to_dict dari model NotificationLog (pastikan to_dict ada dan benar)
            results = [n.to_dict() for n in notifications]
            app.logger.info(f"Fetched {len(results)} recent notifications for admin.")
            return jsonify(results), 200

        except Exception as e:
            app.logger.exception(f"Error fetching recent notifications: {e}")
            return jsonify({"message": "Error fetching notifications."}), 500
        
    @app.route('/api/student/dashboard', methods=['GET'])
    @student_required
    def get_student_dashboard_data():
        """Gets dashboard data (available exams, recent results) for the logged-in student."""
        user = g.current_user
        app.logger.info(f"Fetching dashboard data for student {user.id}")
        try:
            # --- Fetch Available Exams (similar to /available route) ---
            student_group_ids = {group.id for group in user.groups}
            query_available = Exam.query.filter(Exam.status == ExamStatusEnum.PUBLISHED)\
                                    .outerjoin(Exam.assigned_groups)\
                                    .filter(
                                        (Exam.assigned_groups == None) | \
                                        (UserGroup.id.in_(student_group_ids))
                                    ).distinct()
            # Limit the number shown on dashboard
            upcoming_exams_raw = query_available.order_by(Exam.created_at.desc()).limit(5).all()

            upcoming_exams_data = []
            for exam in upcoming_exams_raw:
                exam_data = {
                    'id': exam.id,
                    'name': exam.name,
                    'subject': exam.subject,
                    'duration': exam.duration,
                    'allowed_attempts': exam.allowed_attempts
                }
                 # Add attempts taken for dashboard display
                attempts = ExamSubmission.query.filter_by(user_id=user.id, exam_id=exam.id).count()
                exam_data['attempts_taken'] = attempts
                exam_data['can_attempt'] = attempts < exam.allowed_attempts
                upcoming_exams_data.append(exam_data)

            # --- Fetch Recent Submissions ---
            recent_submissions_raw = db.session.query(ExamSubmission)\
                                           .filter(ExamSubmission.user_id == user.id)\
                                           .options(joinedload(ExamSubmission.exam))\
                                           .order_by(ExamSubmission.submitted_at.desc())\
                                           .limit(3).all() # Limit recent results
            recent_results_data = []
            for sub in recent_submissions_raw:
                 exam_name = sub.exam.name if sub.exam else "Unknown Exam"
                 exam_subject = sub.exam.subject if sub.exam else "N/A"
                 recent_results_data.append({
                    'submissionId': sub.id,
                    'examId': sub.exam_id, # Include exam ID for linking
                    'examName': exam_name,
                    'subject': exam_subject,
                    'dateTaken': sub.submitted_at.isoformat() if sub.submitted_at else 'N/A',
                    'score': sub.score, # Send raw score, let frontend format
                    'correctAnswers': sub.correct_answers_count,
                    'totalQuestions': sub.total_questions_count,
                })

            return jsonify({'upcomingExams': upcoming_exams_data, 'recentResults': recent_results_data}), 200

        except Exception as e:
            app.logger.exception(f"Error fetching student dashboard for user {user.id}: {e}")
            # Return empty lists on error to prevent frontend crash
            return jsonify({"message": "Error fetching dashboard data.", "upcomingExams": [], "recentResults": []}), 500

    @app.route('/api/student/profile', methods=['GET'])
    @student_required
    def get_student_profile():
        """Gets profile information for the logged-in student, including group memberships."""
        student = g.current_user
        app.logger.info(f"Fetching profile for student {student.id}")
        try:
            # User.to_dict should handle including groups based on the flag
            profile_data = student.to_dict(include_groups=True)
            return jsonify(profile_data), 200
        except Exception as e:
            app.logger.exception(f"Error fetching profile for user {student.id}: {e}")
            return jsonify({"message": "Error retrieving profile information."}), 500

    @app.route('/api/student/profile/edit', methods=['POST'])
    @student_required
    def edit_student_profile():
        """Allows student to edit their profile (password). Username edit might be restricted."""
        student = g.current_user
        data = request.get_json()

        if not data: return jsonify({"message": "No update data provided."}), 400

        updated_fields = []
        errors = {}

        # Example: Allow changing password, maybe restrict username change
        # new_username = data.get('username') # If allowing username change, add validation here

        new_password = data.get('password')
        if new_password: # Only update if a new password is provided
            if len(new_password) < 6:
                 errors['password'] = "Password must be at least 6 characters long."
            else:
                 student.set_password(new_password)
                 updated_fields.append("password")

        if errors:
            return jsonify({"message": "Update failed due to validation errors.", "errors": errors}), 400

        if not updated_fields:
            return jsonify({"message": "No changes were submitted."}), 200 # OK, but no changes

        try:
            db.session.commit()
            app.logger.info(f"Profile updated for User ID: {student.id}. Fields: {', '.join(updated_fields)}")
            # Return updated profile (without sensitive info like password hash)
            updated_profile_data = student.to_dict(include_groups=True)
            return jsonify({"message": f"Profile updated successfully ({', '.join(updated_fields)} changed).","user": updated_profile_data}), 200
        except IntegrityError as ie: # Catch potential username duplicate if username change is allowed
            db.session.rollback()
            app.logger.warning(f"Integrity error updating profile for user {student.id}: {ie}")
            # Assume it's the username if that was being changed
            errors['username'] = "Username already taken."
            return jsonify({"message": "Update failed: Username may already be taken.", "errors": errors}), 409
        except Exception as e:
            db.session.rollback()
            app.logger.exception(f"Database error updating profile for user {student.id}: {e}")
            return jsonify({"message": "An internal error occurred while saving profile changes."}), 500


    # --- Proctoring Analysis Route ---
    @app.route('/api/proctor/analyze_frame', methods=['POST'])
    @student_required # Student must be logged in and likely taking an exam
    def analyze_frame():
        """Analyzes a single video frame for proctoring violations."""
        user_id = g.current_user.id
        data = request.get_json()
        frame_data = data.get('frameData') if data else None

        if not frame_data:
            app.logger.warning(f"Analyze frame request missing frame data for user {user_id}")
            return jsonify({"message": "Missing frame data"}), 400
        try:
            # Ensure proctoring module and function exist before calling
            if hasattr(proctoring, 'analyze_frame_proctoring'):
                analysis_result = proctoring.analyze_frame_proctoring(user_id, frame_data)
                # Check the structure of analysis_result
                if isinstance(analysis_result, dict) and "success" in analysis_result:
                    if analysis_result["success"]:
                        # Return relevant fields, ensure cheating_detected is present
                        response_data = {
                             "cheating_detected": analysis_result.get("cheating_detected", False),
                             "reason": analysis_result.get("reason", None),
                             "details": analysis_result.get("details", None) # Include any extra details
                         }
                        response_data = {k: v for k, v in response_data.items() if v is not None} # Clean None values

                        if response_data.get("cheating_detected"):
                             app.logger.info(f"Proctoring violation detected for user {user_id}: {response_data.get('reason', 'N/A')}")
                        return jsonify(response_data), 200
                    else:
                        # Analysis failed within the proctoring module
                        status_code = 500 if "error" in analysis_result.get("message", "").lower() else 400
                        app.logger.error(f"Proctoring analysis failed for user {user_id}: {analysis_result.get('message', 'Unknown error')}")
                        return jsonify({"message": analysis_result.get("message", "Analysis error"), "cheating_detected": False, "reason": "Analysis Error"}), status_code
                else:
                     app.logger.error(f"Unexpected result format from proctoring.analyze_frame_proctoring for user {user_id}: {analysis_result}")
                     return jsonify({"message": "Internal error in proctoring analysis format."}), 500
            else:
                 app.logger.warning(f"Proctoring function not available for user {user_id}")
                 return jsonify({"message": "Proctoring analysis not available", "cheating_detected": False}), 501 # Not Implemented

        except Exception as e:
             app.logger.exception(f"Unexpected error in analyze_frame endpoint for user {user_id}: {e}")
             return jsonify({"message": "Internal server error during frame analysis."}), 500


    # --- Database Initialization Command ---
    @app.cli.command("init-db")
    def init_db_command():
        """Drops existing tables and creates new ones based on models, then seeds initial data."""
        with app.app_context():
            app.logger.info("--- Starting Database Initialization ---")
            app.logger.info("Dropping all tables...")
            db.drop_all()
            app.logger.info("Creating all tables...")
            db.create_all()
            app.logger.info("Seeding initial data...")
            try:
                # Create Admin User
                admin = User(username='admin', role=RoleEnum.ADMIN)
                admin.set_password('admin123')
                db.session.add(admin)

                # Create Student User
                student = User(username='student', role=RoleEnum.STUDENT)
                student.set_password('student123')
                db.session.add(student)

                # Create Sample Exams
                e1 = Exam(name='Midterm Math', subject='Mathematics', duration=60, status=ExamStatusEnum.PUBLISHED, allowed_attempts=1)
                e2 = Exam(name='CS Fundamentals Quiz 1', subject='Computer Science', duration=30, status=ExamStatusEnum.DRAFT, allowed_attempts=2)
                e3 = Exam(name='World History Test', subject='History', duration=45, status=ExamStatusEnum.ARCHIVED, allowed_attempts=1)
                e4 = Exam(name='Physics Basics', subject='Physics', duration=50, status=ExamStatusEnum.PUBLISHED, allowed_attempts=1) # Another published one
                db.session.add_all([e1, e2, e3, e4])
                db.session.flush() # Flush to get IDs for exams

                # Add Questions to Exam 1 (Midterm Math)
                q1_1 = Question(exam_id=e1.id, text="What is 2 + 2?", options=["3", "4", "5"], correct_answer="4")
                q1_2 = Question(exam_id=e1.id, text="What is 5 * 8?", options=["30", "40", "45", "58"], correct_answer="40")
                db.session.add_all([q1_1, q1_2])

                # Add Questions to Exam 4 (Physics Basics)
                q4_1 = Question(exam_id=e4.id, text="What is the unit of force?", options=["Joule", "Watt", "Newton", "Pascal"], correct_answer="Newton")
                q4_2 = Question(exam_id=e4.id, text="What is 'c' in E=mc^2?", options=["Charge", "Speed of Light", "Constant", "Mass"], correct_answer="Speed of Light")
                db.session.add_all([q4_1, q4_2])

                # Add Questions to Exam 2 (CS Draft)
                q2_1 = Question(exam_id=e2.id, text="What does CPU stand for?", options=["Central Processing Unit", "Computer Processing Unit", "Core Programming Unit"], correct_answer="Central Processing Unit")
                db.session.add(q2_1)

                # Create a sample submission for student on Exam 1
                sub1 = ExamSubmission(
                    user_id=student.id, exam_id=e1.id, score=50.0, correct_answers_count=1, total_questions_count=2,
                    answers={str(q1_1.id): "4", str(q1_2.id): "45"} # Example answers (one correct, one wrong)
                )
                db.session.add(sub1)

                # Create a group and add the student
                group1 = UserGroup(name="Class A", description="Standard Class Section")
                db.session.add(group1)
                db.session.flush() # Get group ID
                group1.students.append(student) # Add student to the group

                # Assign Exam 4 to Class A
                e4.assigned_groups.append(group1)


                db.session.commit()
                app.logger.info("Database seeded successfully with sample data.")
            except Exception as e:
                db.session.rollback()
                app.logger.exception(f"Error seeding database: {e}")
                # Re-raise or handle as appropriate
                raise e
            app.logger.info("--- Database Initialization Complete ---")

    return app

# --- Run the Flask Development Server ---
if __name__ == '__main__':
    flask_app = create_app()
    flask_app.run(host='0.0.0.0', debug=True, port=5001, threaded=True, use_reloader=True)