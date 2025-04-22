# backend/app.py
import os
from flask import Flask, request, jsonify, g
from flask_cors import CORS
from functools import wraps
import jwt
from datetime import datetime, timezone, timedelta
from werkzeug.security import check_password_hash
# REMOVED: import base64
# REMOVED: import numpy as np
# REMOVED: import io # Still needed for CSV import
import io # Keep for CSV
# REMOVED: import cv2
# REMOVED: import mediapipe as mp
# REMOVED: import threading
# REMOVED: import math
# REMOVED: from datetime import datetime, timedelta # Keep if used elsewhere, remove if only proctoring

# Import models and config
from models import db, User, Exam, Question, RoleEnum, ExamStatusEnum, ExamSubmission
from config import Config
from dotenv import load_dotenv

from sqlalchemy.orm import joinedload

# --- Import the NEW proctoring module ---
import proctoring # Import the whole module
# OR specific functions:
# from proctoring import initialize_proctoring_state, clear_proctoring_state, analyze_frame_proctoring

# Import pandas for CSV processing
import pandas as pd # Make sure pandas is installed

load_dotenv()

# --- REMOVED MediaPipe Initialization ---

# --- REMOVED In-memory storage for proctoring violations ---
# --- REMOVED proctoring_lock ---

# --- REMOVED Proctoring Configuration ---

# --- REMOVED FACE_POSE_LANDMARK_IDS ---

# --- REMOVED update_cheat_score helper function ---


# Factory function to create the Flask application
def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    try:
        os.makedirs(app.instance_path)
    except OSError:
        pass
    db.init_app(app)
    CORS(app, resources={r"/*": {"origins": "http://localhost:3000",
                                "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
                                "allow_headers": ["Content-Type", "Authorization"]}})


    # --- Authentication Helper Functions (NO CHANGES) ---
    # ... (create_token, token_required, admin_required, student_required) ...
    def create_token(user_id, role):
        payload = {
            'user_id': user_id,
            'role': role.value,
            'exp': datetime.now(timezone.utc) + app.config['JWT_EXPIRATION_DELTA']
        }
        token = jwt.encode(payload, app.config['SECRET_KEY'], algorithm='HS256')
        return token

    def token_required(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            token = None
            if 'Authorization' in request.headers:
                auth_header = request.headers['Authorization']
                try:
                    token = auth_header.split(" ")[1]
                except IndexError:
                    return jsonify({'message': 'Bearer token malformed'}), 401
            if not token:
                return jsonify({'message': 'Token is missing'}), 401
            try:
                data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
                current_user = User.query.get(data['user_id'])
                if not current_user:
                     return jsonify({'message': 'User not found'}), 401
                g.current_user = current_user
                g.current_role = data['role']
            except jwt.ExpiredSignatureError:
                return jsonify({'message': 'Token has expired'}), 401
            except jwt.InvalidTokenError:
                return jsonify({'message': 'Token is invalid'}), 401
            except Exception as e:
                 print(f"Token validation error: {e}")
                 return jsonify({'message': 'Token validation error'}), 401
            return f(*args, **kwargs)
        return decorated

    def admin_required(f):
        @wraps(f)
        @token_required
        def decorated(*args, **kwargs):
            if g.current_role != RoleEnum.ADMIN.value:
                 return jsonify({'message': 'Admin privileges required'}), 403
            return f(*args, **kwargs)
        return decorated

    def student_required(f):
        @wraps(f)
        @token_required
        def decorated(*args, **kwargs):
             if g.current_role != RoleEnum.STUDENT.value:
                 return jsonify({'message': 'Student privileges required'}), 403
             return f(*args, **kwargs)
        return decorated


    # --- API Routes ---

    # ... (Login, Register, Admin Routes - NO CHANGES NEEDED in these for proctoring separation) ...
    @app.route('/api/login', methods=['POST'])
    def login():
        data = request.get_json()
        if not data or not data.get('username') or not data.get('password'): return jsonify({'message': 'Username and password required'}), 400
        user = User.query.filter_by(username=data['username']).first()
        if not user or not user.check_password(data['password']): return jsonify({'message': 'Invalid credentials'}), 401
        token = create_token(user.id, user.role)
        return jsonify({'token': token, 'role': user.role.value})

    @app.route('/api/register', methods=['POST'])
    def register():
        data = request.get_json()
        if not data or not data.get('username') or not data.get('password'): return jsonify({'message': 'Username and password required'}), 400
        username = data['username'].strip()
        password = data['password']
        if len(username) < 3: return jsonify({'message': 'Username must be at least 3 characters long'}), 400
        if len(password) < 6: return jsonify({'message': 'Password must be at least 6 characters long'}), 400
        existing_user = User.query.filter_by(username=username).first()
        if existing_user: return jsonify({'message': 'Username already exists'}), 409
        try:
            new_user = User(username=username, role=RoleEnum.STUDENT)
            new_user.set_password(password)
            db.session.add(new_user)
            db.session.commit()
            return jsonify({'message': 'Student registered successfully'}), 201
        except Exception as e:
            db.session.rollback(); print(f"Error during registration: {e}"); return jsonify({'message': 'Registration failed due to an internal error'}), 500

    @app.route('/api/admin/dashboard/stats', methods=['GET'])
    @admin_required
    def get_admin_dashboard_stats():
        """Calculates and returns key statistics for the admin dashboard."""
        try:
            # Calculate Total Exams
            total_exams = db.session.query(Exam.id).count() # More efficient count
            # Calculate Active Exams (Published)
            active_exams = db.session.query(Exam.id).filter_by(status=ExamStatusEnum.PUBLISHED).count()
            # Calculate Total Students
            total_students = db.session.query(User.id).filter_by(role=RoleEnum.STUDENT).count()
            # Calculate Recent Submissions (within last 24 hours)
            twenty_four_hours_ago = datetime.utcnow() - timedelta(hours=24)
            recent_submissions = db.session.query(ExamSubmission.id)\
                                     .filter(ExamSubmission.submitted_at >= twenty_four_hours_ago)\
                                     .count()
            # Prepare the response data
            stats_data = {
                "totalExams": total_exams,
                "activeExams": active_exams,
                "totalStudents": total_students,
                "recentSubmissions": recent_submissions
            }
            return jsonify(stats_data), 200
        except Exception as e:
            print(f"Error calculating admin dashboard stats: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({"message": "Error fetching dashboard statistics."}), 500

    @app.route('/api/admin/exams', methods=['GET'])
    @admin_required
    def get_admin_exams():
        try:
            exams = Exam.query.order_by(Exam.id.desc()).all()
            return jsonify([exam.to_dict(include_questions=False) for exam in exams])
        except Exception as e:
            print(f"--- UNEXPECTED ERROR in get_admin_exams: {e} ---")
            return jsonify({"message": "An internal server error occurred while fetching exams."}), 500

    @app.route('/api/admin/exams', methods=['POST'])
    @admin_required
    def create_exam():
        data = request.get_json(); required = ['name','subject','duration','status','allowed_attempts','questions']
        if not data or not all(f in data for f in required): return jsonify({"message":"Missing fields"}), 400
        try:
            attempts = int(data['allowed_attempts']); duration = int(data['duration'])
            if attempts < 1 or duration < 1: return jsonify({"message":"Invalid attempts/duration"}), 400
            new_exam=Exam(name=data['name'], subject=data['subject'], duration=duration, status=ExamStatusEnum(data['status']), allowed_attempts=attempts)
            db.session.add(new_exam); db.session.flush()
            q_data = data.get('questions', [])
            if not isinstance(q_data, list): raise ValueError("Questions must be list")
            for q in q_data:
                q_req = ['text','options','correct_answer']
                if not all(f in q for f in q_req): raise ValueError("Missing question fields")
                if not isinstance(q['options'],list) or not q['options']: raise ValueError("Invalid options")
                if q['correct_answer'] not in q['options']: raise ValueError("Correct answer not in options")
                nq=Question(exam_id=new_exam.id, text=q['text'], options=q['options'], correct_answer=q['correct_answer'])
                db.session.add(nq)
            db.session.commit(); return jsonify(new_exam.to_dict(include_questions=True)), 201
        except (ValueError, TypeError, KeyError) as e: db.session.rollback(); return jsonify({"message": f"Invalid data: {e}"}), 400
        except Exception as e: db.session.rollback(); print(f"Err: {e}"); return jsonify({"message":"Internal error"}), 500

    @app.route('/api/admin/exams/<int:exam_id>/import_csv', methods=['POST'])
    @admin_required
    def import_questions_from_csv(exam_id):
        """Imports questions from a CSV file for a specific exam."""
        exam = Exam.query.get_or_404(exam_id)

        if 'file' not in request.files:
            return jsonify({"message": "No file part in the request"}), 400
        file = request.files['file']
        if file.filename == '':
            return jsonify({"message": "No selected file"}), 400

        if file and file.filename.lower().endswith('.csv'):
            try:
                stream = io.StringIO(file.stream.read().decode("UTF8"), newline=None)
                # Specify separator if needed, e.g., pd.read_csv(stream, sep=',')
                df = pd.read_csv(stream)

                required_columns = ['question', 'option1', 'option2', 'option3', 'option4', 'correct_answer']
                if not all(col in df.columns for col in required_columns):
                    missing = [col for col in required_columns if col not in df.columns]
                    return jsonify({"message": f"CSV file is missing required columns: {', '.join(missing)}"}), 400

                # Optional: Delete existing questions
                # Question.query.filter_by(exam_id=exam_id).delete()

                new_questions_added = 0
                errors = []
                for index, row in df.iterrows():
                    try:
                        question_text = str(row.get('question', '')).strip() # Use .get for safety
                        options = [
                            str(row[f'option{i}']).strip()
                            for i in range(1, 5)
                            if pd.notna(row.get(f'option{i}')) and str(row.get(f'option{i}')).strip()
                        ]
                        correct_answer_text = str(row.get('correct_answer', '')).strip()

                        if not question_text: errors.append(f"Row {index + 2}: Question text empty."); continue
                        if not options: errors.append(f"Row {index + 2}: No valid options found."); continue
                        if not correct_answer_text: errors.append(f"Row {index + 2}: Correct answer empty."); continue
                        if correct_answer_text not in options:
                            errors.append(f"Row {index + 2}: Correct answer '{correct_answer_text}' not in options {options}."); continue

                        new_question = Question(
                            exam_id=exam.id, text=question_text, options=options, correct_answer=correct_answer_text
                        )
                        db.session.add(new_question)
                        new_questions_added += 1
                    except Exception as row_error:
                        errors.append(f"Row {index + 2}: Error processing - {row_error}")
                        continue

                if errors:
                    db.session.rollback()
                    return jsonify({"message": "Import failed due to errors.", "errors": errors}), 400
                else:
                    db.session.commit()
                    return jsonify({"message": f"Successfully imported {new_questions_added} questions for exam '{exam.name}'."}), 201

            except pd.errors.EmptyDataError:
                return jsonify({"message": "CSV file is empty."}), 400
            except Exception as e:
                db.session.rollback()
                print(f"Error importing CSV for exam {exam_id}: {e}")
                import traceback
                traceback.print_exc()
                return jsonify({"message": f"An error occurred during CSV processing: {e}"}), 500
        else:
            return jsonify({"message": "Invalid file type. Please upload a CSV file."}), 400

    @app.route('/api/admin/exams/<int:exam_id>', methods=['GET'])
    @admin_required
    def get_exam(exam_id):
        exam = Exam.query.options(db.joinedload(Exam.questions)).get_or_404(exam_id)
        return jsonify(exam.to_dict(include_questions=True))

    @app.route('/api/admin/exams/<int:exam_id>', methods=['PUT'])
    @admin_required
    def update_exam(exam_id):
        exam = Exam.query.get_or_404(exam_id); data = request.get_json(); required = ['name','subject','duration','status','allowed_attempts','questions']
        if not data or not all(f in data for f in required): return jsonify({"message":"Missing fields"}), 400
        try:
            attempts = int(data['allowed_attempts']); duration = int(data['duration'])
            if attempts < 1 or duration < 1: return jsonify({"message":"Invalid attempts/duration"}), 400
            exam.name=data['name']; exam.subject=data['subject']; exam.duration=duration; exam.status=ExamStatusEnum(data['status']); exam.allowed_attempts=attempts
            Question.query.filter_by(exam_id=exam_id).delete() # Delete old Qs
            q_data = data.get('questions', [])
            if not isinstance(q_data, list): raise ValueError("Questions must be list")
            for q in q_data: # Re-add Qs
                q_req = ['text','options','correct_answer']
                if not all(f in q for f in q_req): raise ValueError("Missing question fields")
                if not isinstance(q['options'],list) or not q['options']: raise ValueError("Invalid options")
                if q['correct_answer'] not in q['options']: raise ValueError("Correct answer not in options")
                nq=Question(exam_id=exam.id, text=q['text'], options=q['options'], correct_answer=q['correct_answer'])
                db.session.add(nq)
            db.session.commit(); return jsonify(exam.to_dict(include_questions=True))
        except (ValueError, TypeError, KeyError) as e: db.session.rollback(); return jsonify({"message": f"Invalid data: {e}"}), 400
        except Exception as e: db.session.rollback(); print(f"Err: {e}"); return jsonify({"message":"Internal error"}), 500

    @app.route('/api/admin/exams/<int:exam_id>', methods=['DELETE'])
    @admin_required
    def delete_exam(exam_id):
        exam = Exam.query.get_or_404(exam_id)
        try: db.session.delete(exam); db.session.commit(); return jsonify({"message": f"Exam '{exam.name}' deleted"}), 200
        except Exception as e: db.session.rollback(); print(f"Err: {e}"); return jsonify({"message":"Internal error"}), 500

    @app.route('/api/admin/exams/<int:exam_id>/results', methods=['GET'])
    @admin_required
    def get_exam_results(exam_id):
        try:
            exam = Exam.query.get(exam_id)
            if not exam: return jsonify({"message": "Exam not found"}), 404
            submissions = ExamSubmission.query.filter_by(exam_id=exam_id)\
                                               .options(db.joinedload(ExamSubmission.student)) \
                                               .order_by(ExamSubmission.submitted_at.desc())\
                                               .all()
            results = [sub.to_dict() for sub in submissions]
            return jsonify(results), 200
        except Exception as e:
            print(f"Error fetching results for exam {exam_id}: {e}")
            return jsonify({"message": "An internal server error occurred while fetching results."}), 500


    # --- Student Routes ---
    @app.route('/api/student/exams/available', methods=['GET'])
    @student_required
    def get_student_available_exams():
        exams = Exam.query.filter_by(status=ExamStatusEnum.PUBLISHED).all()
        return jsonify([exam.to_dict(include_questions=False) for exam in exams])

    @app.route('/api/student/exams/<int:exam_id>/take', methods=['GET'])
    @student_required
    def get_exam_for_student(exam_id):
        try:
            exam = Exam.query.filter_by(id=exam_id, status=ExamStatusEnum.PUBLISHED).first_or_404()
            exam_data = exam.to_dict(include_questions=True)
            if 'questions' in exam_data:
                for q in exam_data['questions']: q.pop('correct_answer', None)

            # --- Initialize Proctoring State using the new module ---
            user_id = g.current_user.id
            proctoring.initialize_proctoring_state(user_id) # Call the function from proctoring.py

            return jsonify(exam_data)
        except Exception as e:
             print(f"--- ERROR fetching exam {exam_id} for student: {e} ---")
             import traceback
             traceback.print_exc()
             return jsonify({"message": "Error retrieving exam details."}), 500

    @app.route('/api/student/exams/<int:exam_id>/submit', methods=['POST'])
    @student_required
    def submit_exam_answers(exam_id):
        data = request.get_json()
        if not data or 'answers' not in data or not isinstance(data['answers'], dict):
            return jsonify({"message": "Missing or invalid 'answers' data."}), 400

        student_answers = data['answers']
        user_id = g.current_user.id
        print(f"--- Received submission request for Exam ID: {exam_id} from User ID: {user_id} ---")

        try:
            exam = Exam.query.options(joinedload(Exam.questions)).get(exam_id)
            if not exam: return jsonify({"message": "Exam not found."}), 404
            if exam.status != ExamStatusEnum.PUBLISHED:
                return jsonify({"message": "This exam is not currently available for submission."}), 403

            attempts_taken = ExamSubmission.query.filter_by(user_id=user_id, exam_id=exam_id).count()
            if attempts_taken >= exam.allowed_attempts:
                return jsonify({"message": f"Submission failed: Maximum attempts ({exam.allowed_attempts}) reached."}), 403
            print(f"--- User {user_id} attempt {attempts_taken + 1}/{exam.allowed_attempts} for Exam {exam_id} ---")

            questions = exam.questions
            total_questions = len(questions) if questions else 0
            correct_answers = 0
            calculated_score = 0.0

            if total_questions > 0:
                question_map = {str(q.id): q.correct_answer for q in questions}
                for q_id_str, correct_ans in question_map.items():
                    student_ans = student_answers.get(q_id_str)
                    if student_ans == correct_ans:
                        correct_answers += 1
                calculated_score = (correct_answers / total_questions) * 100.0

            new_submission = ExamSubmission(
                user_id=user_id, exam_id=exam_id, submitted_at=datetime.utcnow(),
                score=calculated_score, correct_answers_count=correct_answers,
                total_questions_count=total_questions, answers=student_answers
            )
            db.session.add(new_submission)
            db.session.commit()
            print(f"--- SUCCESSFULLY SAVED submission ID: {new_submission.id} for User {user_id}, Exam {exam_id} ---")

            # --- Clear Proctoring State using the new module (after successful commit) ---
            proctoring.clear_proctoring_state(user_id) # Call the function from proctoring.py

            return jsonify({
                "message": "Exam submitted successfully.",
                "submissionId": new_submission.id,
                "correctAnswers": correct_answers,
                "totalQuestions": total_questions,
                "score": calculated_score
            }), 200

        except Exception as e:
            db.session.rollback()
            print(f"!!! CRITICAL ERROR during submission processing for User {user_id}, Exam {exam_id}: {type(e).__name__} - {e} !!!")
            import traceback
            traceback.print_exc()
            return jsonify({"message": "An internal server error occurred during exam submission."}), 500


    @app.route('/api/student/dashboard', methods=['GET'])
    @student_required
    def get_student_dashboard_data():
        user_id = g.current_user.id
        try:
            # Fetch upcoming exams
            upcoming = Exam.query.filter(Exam.status == ExamStatusEnum.PUBLISHED)\
                                 .order_by(Exam.id.desc())\
                                 .limit(3).all()
            up_data = [{'id':e.id, 'name':e.name, 'subject':e.subject, 'duration':e.duration} for e in upcoming]

            # Fetch recent submissions for this student with exam details
            recent_submissions = db.session.query(ExamSubmission, Exam.name, Exam.subject)\
                                            .join(Exam, ExamSubmission.exam_id == Exam.id)\
                                            .filter(ExamSubmission.user_id == user_id)\
                                            .order_by(ExamSubmission.submitted_at.desc())\
                                            .limit(2).all() # Limit results

            rec_data = []
            for sub, exam_name, exam_subject in recent_submissions:
                 rec_data.append({
                    'submissionId': sub.id,
                    'examName': exam_name,
                    'subject': exam_subject,
                    'dateTaken': sub.submitted_at.strftime('%Y-%m-%d %H:%M') if sub.submitted_at else 'N/A',
                    'score': f"{sub.score:.1f}%" if sub.score is not None else 'N/A',
                })

            return jsonify({'upcomingExams': up_data, 'recentResults': rec_data}), 200
        except Exception as e:
            print(f"Error fetching student dashboard data for user {user_id}: {e}")
            import traceback
            traceback.print_exc()
            # Return empty lists or error message
            return jsonify({"message": "Error fetching dashboard data.", "upcomingExams": [], "recentResults": []}), 500

    @app.route('/api/student/profile', methods=['GET'])
    @student_required
    def get_student_profile():
        student = g.current_user
        try:
            profile_data = { "id": student.id, "username": student.username, "role": student.role.value }
            return jsonify(profile_data), 200
        except Exception as e:
            print(f"Error fetching profile for user {student.id}: {e}")
            return jsonify({"message": "Error retrieving profile information."}), 500

    @app.route('/api/student/profile/edit', methods=['POST'])
    @student_required
    def edit_student_profile():
        student = g.current_user
        data = request.get_json()
        if not data: return jsonify({"message": "No update data provided."}), 400

        updated_fields = []; errors = {}

        new_username = data.get('username')
        if new_username is not None:
            new_username = new_username.strip()
            if not new_username: errors['username'] = "Username cannot be empty."
            elif len(new_username) < 3: errors['username'] = "Username must be >= 3 characters."
            elif new_username != student.username:
                existing_user = User.query.filter(User.username == new_username, User.id != student.id).first()
                if existing_user: errors['username'] = "Username already taken."
                else: student.username = new_username; updated_fields.append("username")

        new_password = data.get('password')
        if new_password:
            if len(new_password) < 6: errors['password'] = "Password must be >= 6 characters."
            else: student.set_password(new_password); updated_fields.append("password")

        if errors: return jsonify({"message": "Update failed.", "errors": errors}), 400
        if not updated_fields: return jsonify({"message": "No changes detected."}), 200

        try:
            db.session.commit()
            print(f"--- Profile updated for User ID: {student.id}. Fields: {', '.join(updated_fields)} ---")
            updated_profile_data = { "id": student.id, "username": student.username, "role": student.role.value }
            return jsonify({"message": f"Profile updated ({', '.join(updated_fields)} changed)","user": updated_profile_data}), 200
        except Exception as e:
            db.session.rollback()
            print(f"!!! DB ERROR updating profile for user {student.id}: {e}")
            return jsonify({"message": "Internal error saving profile changes."}), 500


    # --- UPDATED: Proctoring Analysis Route ---
    @app.route('/api/proctor/analyze_frame', methods=['POST'])
    @student_required
    def analyze_frame():
        user_id = g.current_user.id
        data = request.get_json()
        frame_data = data.get('frameData') if data else None

        if not frame_data:
            return jsonify({"message": "Missing frame data"}), 400

        # --- Call the proctoring analysis function from the new module ---
        analysis_result = proctoring.analyze_frame_proctoring(user_id, frame_data)

        # --- Return the result from the proctoring module ---
        if analysis_result["success"]:
            # Remove success/message fields before sending back to client
            response_data = {k: v for k, v in analysis_result.items() if k not in ['success', 'message']}
            return jsonify(response_data), 200
        else:
            # If analysis failed (e.g., decode error, internal error), return appropriate status
            # The proctoring module logs the specific error
            status_code = 500 if "Internal server error" in analysis_result["message"] else 400
            return jsonify({"message": analysis_result["message"], "cheating_detected": False, "reason": analysis_result.get("reason", "Error")}), status_code


    # --- Database Initialization Command (NO CHANGES) ---
    @app.cli.command("init-db")
    def init_db_command():
        # ... (init-db logic remains the same) ...
        with app.app_context():
            print("Dropping/Creating tables..."); db.drop_all(); db.create_all()
            print("Seeding data...")
            try:
                admin = User(username='admin', role=RoleEnum.ADMIN); admin.set_password('admin123'); db.session.add(admin)
                student = User(username='student', role=RoleEnum.STUDENT); student.set_password('student123'); db.session.add(student)
                e1 = Exam(name='Midterm', subject='Math', duration=60, status=ExamStatusEnum.PUBLISHED, allowed_attempts=1)
                e2 = Exam(name='Quiz 1', subject='CS', duration=30, status=ExamStatusEnum.DRAFT, allowed_attempts=2)
                e3 = Exam(name='History Test', subject='History', duration=45, status=ExamStatusEnum.ARCHIVED, allowed_attempts=1)
                db.session.add_all([e1, e2, e3])
                # Add sample questions if needed here
                db.session.commit(); print("DB seeded.")
            except Exception as e: db.session.rollback(); print(f"Seeding error: {e}")

    return app

# --- Run the Flask Development Server (NO CHANGES) ---
if __name__ == '__main__':
    app = create_app()
    # Use threaded=True for handling concurrent proctoring requests smoothly
    app.run(debug=True, port=5001, threaded=True)