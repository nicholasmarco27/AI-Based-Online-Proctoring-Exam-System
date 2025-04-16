# backend/app.py (Complete with Scheduling/Attempts + Face Count + Head Pose Proctoring)
import os
from flask import Flask, request, jsonify, g
from flask_cors import CORS
from functools import wraps
import jwt
from datetime import datetime, timezone, timedelta
from werkzeug.security import check_password_hash
import base64
import numpy as np
import io 
import cv2 # OpenCV for image processing
import mediapipe as mp # For face detection and mesh
import threading
import math # For atan2 in angle calculation
from datetime import datetime, timedelta

# Import models and config
from models import db, User, Exam, Question, RoleEnum, ExamStatusEnum, ExamSubmission
from config import Config
from dotenv import load_dotenv

from sqlalchemy.orm import joinedload


load_dotenv()

# --- MediaPipe Initialization ---
mp_face_detection = mp.solutions.face_detection
mp_face_mesh = mp.solutions.face_mesh
mp_drawing = mp.solutions.drawing_utils # Keep if debugging landmarks needed

# Using short-range model, confidence 0.5 for face counting
face_detector = mp_face_detection.FaceDetection(min_detection_confidence=0.5, model_selection=0)
# Face Mesh for head pose (use default settings initially)
face_mesh = mp_face_mesh.FaceMesh(max_num_faces=1, # Optimize: only process 1 face for pose
                                  min_detection_confidence=0.5,
                                  min_tracking_confidence=0.5)

# --- In-memory storage for proctoring violations ---
# WARNING: Lost on server restart. Use Redis or DB for persistence.
# Structure: { user_id: { 'no_face_streak': 0, 'multi_face_streak': 0, 'head_pose_score': 0.0 } }
proctoring_violations = {}
proctoring_lock = threading.Lock()

# --- Proctoring Configuration ---
MAX_CONSECUTIVE_NO_FACE = 5
MAX_CONSECUTIVE_MULTI_FACE = 3
# Head Pose Thresholds (Degrees) - **TUNING REQUIRED**
HEAD_POSE_YAW_THRESHOLD = 15.0 # degrees left/right
HEAD_POSE_PITCH_THRESHOLD = -10.0 # degrees down (negative pitch)
# Cheating Score Calculation
HEAD_POSE_SCORE_INCREASE_FACTOR = 0.15 # Factor when head is away
HEAD_POSE_SCORE_DECREASE_FACTOR = 0.05 # Factor when head is forward
HEAD_POSE_SCORE_THRESHOLD = 0.65 # Threshold to trigger cheating flag
# Landmark IDs for solvePnP (similar to example)
FACE_POSE_LANDMARK_IDS = [33, 263, 1, 61, 291, 199] # Left eye, right eye, nose tip, left mouth corner, right mouth corner, chin


# --- Helper: Averaging function (adapted from detection.py inspiration) ---
def update_cheat_score(current_violation_level, previous_score, increase_factor, decrease_factor):
    """
    Updates the cheat score using a smoothing approach.
    current_violation_level: 0 if no violation, > 0 if violation (e.g., 1).
    previous_score: The score from the last frame.
    increase_factor: How much to add towards 1.0 if violation occurs.
    decrease_factor: How much to reduce towards 0.0 if no violation.
    """
    if current_violation_level > 0: # Increase score towards 1
        # Weighted average: new_score = (1-inc_factor)*prev + inc_factor*1.0
        new_score = previous_score + increase_factor * (1.0 - previous_score)
    else: # Decrease score towards 0
        # Weighted average: new_score = (1-dec_factor)*prev + dec_factor*0.0
        new_score = previous_score * (1.0 - decrease_factor)

    # Clamp the score between 0 and 1
    return max(0.0, min(1.0, new_score))


# Factory function to create the Flask application
def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    # ... (DB init, CORS setup - NO CHANGES) ...
    try:
        os.makedirs(app.instance_path)
    except OSError:
        pass # Folder already exists
    db.init_app(app)
    # Configure CORS to allow requests from localhost:3000 with proper headers
    CORS(app, resources={r"/*": {"origins": "http://localhost:3000", 
                                "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
                                "allow_headers": ["Content-Type", "Authorization"]}})


    # --- Authentication Helper Functions ---
    # ... (create_token, token_required, admin_required, student_required - NO CHANGES) ...
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
    # --- End Authentication Helper Functions ---


    # --- API Routes ---
    # ... (Login, Register, Admin Exam CRUD - NO CHANGES) ...
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
            # Return default error values or an error message
            return jsonify({
                "message": "Error fetching dashboard statistics.",
                 # Optionally provide defaults on error:
                 "totalExams": "Error",
                 "activeExams": "Error",
                 "totalStudents": "Error",
                 "recentSubmissions": "Error"
            }), 500
        
     
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
                # Baca file CSV langsung dari stream request menggunakan Pandas
                # Gunakan io.StringIO untuk membaca konten file sebagai string
                stream = io.StringIO(file.stream.read().decode("UTF8"), newline=None)
                df = pd.read_csv(stream)

                # --- Validasi Nama Kolom ---
                required_columns = ['question', 'option1', 'option2', 'option3', 'option4', 'correct_answer']
                if not all(col in df.columns for col in required_columns):
                    missing = [col for col in required_columns if col not in df.columns]
                    return jsonify({"message": f"CSV file is missing required columns: {', '.join(missing)}"}), 400

                # Hapus pertanyaan lama jika diinginkan (opsional, sesuai kebutuhan)
                # Question.query.filter_by(exam_id=exam_id).delete()
                # print(f"--- Deleted existing questions for exam {exam_id} before import ---")

                new_questions_added = 0
                errors = []
                for index, row in df.iterrows():
                    try:
                        question_text = str(row['question']).strip()
                        # Ambil semua opsi yang ada (tidak NaN atau kosong)
                        options = [
                            str(row[f'option{i}']).strip()
                            for i in range(1, 5) # Asumsi hingga 4 opsi
                            if pd.notna(row[f'option{i}']) and str(row[f'option{i}']).strip()
                        ]
                        correct_answer_text = str(row['correct_answer']).strip()

                        # --- Validasi Data Baris ---
                        if not question_text:
                            errors.append(f"Row {index + 2}: Question text cannot be empty.")
                            continue
                        if not options:
                            errors.append(f"Row {index + 2}: At least one option is required.")
                            continue
                        if not correct_answer_text:
                            errors.append(f"Row {index + 2}: Correct answer cannot be empty.")
                            continue
                        if correct_answer_text not in options:
                            errors.append(f"Row {index + 2}: Correct answer '{correct_answer_text}' is not listed in the options {options}.")
                            continue

                        # Buat objek Question baru
                        new_question = Question(
                            exam_id=exam.id,
                            text=question_text,
                            options=options,  # Gunakan setter property untuk konversi ke JSON
                            correct_answer=correct_answer_text
                        )
                        db.session.add(new_question)
                        new_questions_added += 1

                    except Exception as row_error:
                        # Tangkap error spesifik per baris
                        errors.append(f"Row {index + 2}: Error processing - {row_error}")
                        continue # Lanjut ke baris berikutnya

                if errors:
                    # Jika ada error, rollback perubahan dan laporkan error
                    db.session.rollback()
                    return jsonify({
                        "message": "Import failed due to errors in the CSV data.",
                        "errors": errors
                    }), 400
                else:
                    # Jika tidak ada error, commit semua pertanyaan baru
                    db.session.commit()
                    return jsonify({
                        "message": f"Successfully imported {new_questions_added} questions for exam '{exam.name}'."
                    }), 201

            except pd.errors.EmptyDataError:
                db.session.rollback()
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
            for q in q_data: # Re-add Qs (validation like POST)
                q_req = ['text','options','correct_answer']; # ... validation ...
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
        """Fetches all submissions for a specific exam."""
        try:
            # Verify exam exists (optional but good practice)
            exam = Exam.query.get(exam_id)
            if not exam:
                return jsonify({"message": "Exam not found"}), 404

            # Query submissions, eager load student data for efficiency
            submissions = ExamSubmission.query.filter_by(exam_id=exam_id)\
                                               .options(db.joinedload(ExamSubmission.student)) \
                                               .order_by(ExamSubmission.submitted_at.desc())\
                                               .all()

            # Serialize results using the model's to_dict method
            results = [sub.to_dict() for sub in submissions]

            return jsonify(results), 200

        except Exception as e:
            print(f"Error fetching results for exam {exam_id}: {e}")
            # Log the full error traceback for debugging if needed
            # import traceback
            # traceback.print_exc()
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

            # --- Initialize/Reset proctoring state ---
            user_id = g.current_user.id
            with proctoring_lock:
                proctoring_violations[user_id] = {'no_face_streak': 0, 'multi_face_streak': 0, 'head_pose_score': 0.0}
                print(f"--- Initialized/Reset proctoring state for user {user_id} ---")

            return jsonify(exam_data)
        except Exception as e:
             print(f"--- ERROR fetching exam {exam_id} for student: {e} ---")
             return jsonify({"message": "Error retrieving exam details."}), 500

    @app.route('/api/student/exams/<int:exam_id>/submit', methods=['POST'])
    @student_required
    def submit_exam_answers(exam_id):
        data = request.get_json()
        # --- Validasi Input Awal ---
        if not data or 'answers' not in data or not isinstance(data['answers'], dict):
            print(f"[Submit Error] Invalid or missing 'answers' payload for exam {exam_id}")
            return jsonify({"message": "Missing or invalid 'answers' data (must be a dictionary)."}), 400

        student_answers = data['answers'] # Format: {"question_id": "selected_option", ...}
        user_id = g.current_user.id
        print(f"--- Received submission request for Exam ID: {exam_id} from User ID: {user_id} ---")
        # print(f"--- Raw Answers Received: {student_answers} ---") # Optional: Log raw answers

        try:
            # --- Ambil Data Ujian & Pertanyaan ---
            # Eager load questions for efficiency
            exam = Exam.query.options(joinedload(Exam.questions)).get(exam_id)
            if not exam:
                print(f"[Submit Error] Exam with ID {exam_id} not found.")
                return jsonify({"message": "Exam not found."}), 404
            # Pastikan ujian bisa disubmit (misal: status PUBLISHED)
            if exam.status != ExamStatusEnum.PUBLISHED:
                print(f"[Submit Error] Exam {exam_id} is not PUBLISHED (Status: {exam.status.value}).")
                return jsonify({"message": "This exam is not currently available for submission."}), 403

            # --- Cek Jumlah Percobaan (Attempts) ---
            # (Penting untuk mencegah submit berlebih)
            attempts_taken = ExamSubmission.query.filter_by(user_id=user_id, exam_id=exam_id).count()
            if attempts_taken >= exam.allowed_attempts:
                print(f"[Submit Error] User {user_id} exceeded allowed attempts ({attempts_taken}/{exam.allowed_attempts}) for Exam {exam_id}.")
                return jsonify({"message": f"Submission failed: Maximum attempts ({exam.allowed_attempts}) reached."}), 403
            print(f"--- User {user_id} attempt {attempts_taken + 1}/{exam.allowed_attempts} for Exam {exam_id} ---")

            questions = exam.questions
            if not questions:
                # Kasus jika ujian tidak punya soal (seharusnya tidak terjadi)
                total_questions = 0
                correct_answers = 0
                calculated_score = 0.0
                print(f"[Submit Warning] Exam {exam_id} has no questions.")
            else:
                # --- Hitung Skor di SERVER ---
                question_map = {str(q.id): q.correct_answer for q in questions}
                total_questions = len(question_map)
                correct_answers = 0

                for q_id_str, correct_ans in question_map.items():
                    student_ans = student_answers.get(q_id_str) # Ambil jawaban siswa untuk soal ini
                    # Lakukan perbandingan case-sensitive atau insensitive sesuai kebutuhan
                    # Contoh: if student_ans is not None and student_ans.strip() == correct_ans:
                    if student_ans == correct_ans:
                        correct_answers += 1

                calculated_score = (correct_answers / total_questions) * 100.0 if total_questions > 0 else 0.0
                print(f"--- Score calculated for User {user_id}, Exam {exam_id}: {correct_answers}/{total_questions} ({calculated_score:.2f}%) ---")

            # --- >>> BAGIAN YANG HILANG DI KODE ANDA: SIMPAN HASIL KE DATABASE <<< ---
            new_submission = ExamSubmission(
                user_id=user_id,
                exam_id=exam_id, # Gunakan exam_id dari parameter route
                submitted_at=datetime.utcnow(), # Waktu UTC saat submit
                score=calculated_score,
                correct_answers_count=correct_answers,
                total_questions_count=total_questions,
                answers=student_answers # Property setter model akan handle JSON dump
            )
            print(f"--- Preparing to add submission to DB: User {user_id}, Exam {exam_id}, Score {calculated_score} ---")
            db.session.add(new_submission)
            print("--- Submission object added to session ---")
            db.session.commit() # Simpan perubahan ke database
            print(f"--- !!! SUCCESSFULLY SAVED submission ID: {new_submission.id} for User {user_id}, Exam {exam_id} !!! ---")
            # --- >>> AKHIR BAGIAN YANG HILANG <<< ---


            # --- Bersihkan State Proctoring (setelah commit berhasil) ---
            with proctoring_lock:
                if user_id in proctoring_violations:
                    del proctoring_violations[user_id]
                    print(f"--- Cleared proctoring state for user {user_id} after successful submission ---")

            # --- Kembalikan Hasil ke Frontend Mahasiswa ---
            return jsonify({
                "message": "Exam submitted successfully.",
                "submissionId": new_submission.id, # Kirim ID submission yang baru dibuat
                "correctAnswers": correct_answers,
                "totalQuestions": total_questions,
                "score": calculated_score
                # "reviewUrl": None # Tambahkan jika ada fitur review
            }), 200 # Gunakan 200 OK

        except Exception as e:
            # Tangani error jika terjadi sebelum commit
            db.session.rollback() # BATALKAN semua perubahan sesi jika ada error
            print(f"!!! CRITICAL ERROR during submission processing for User {user_id}, Exam {exam_id}: {type(e).__name__} - {e} !!!")
            import traceback
            traceback.print_exc() # Cetak traceback lengkap untuk debugging
            return jsonify({"message": "An internal server error occurred during exam submission. Please try again or contact support."}), 500

    @app.route('/api/student/dashboard', methods=['GET'])
    @student_required
    def get_student_dashboard_data():
        # ... (existing dashboard logic) ...
        # Example: Fetch some basic data
        upcoming = Exam.query.filter(Exam.status == ExamStatusEnum.PUBLISHED)\
                             .order_by(Exam.id.desc())\
                             .limit(3).all()
        # Fetch recent submissions for this specific student
        recent_submissions = ExamSubmission.query.filter_by(user_id=g.current_user.id)\
                                                 .order_by(ExamSubmission.submitted_at.desc())\
                                                 .limit(2).all()

        up_data = [{'id':e.id, 'name':e.name, 'subject':e.subject, 'duration':e.duration} for e in upcoming]
        # Fetch related exam details for recent submissions
        rec_data = []
        for sub in recent_submissions:
            exam = Exam.query.get(sub.exam_id) # Fetch the exam details
            rec_data.append({
                'submissionId': sub.id,
                'examName': exam.name if exam else 'Exam Not Found', # Handle if exam was deleted
                'subject': exam.subject if exam else 'N/A',
                'dateTaken': sub.submitted_at.strftime('%Y-%m-%d %H:%M:%S') if sub.submitted_at else 'N/A', # Format date
                'score': f"{sub.score:.2f}%" if sub.score is not None else 'N/A' , # Format score
                # Add grade calculation if needed based on score
            })

        return jsonify({'upcomingExams': up_data, 'recentResults': rec_data})

    @app.route('/api/student/profile', methods=['GET'])
    @student_required
    def get_student_profile():
        """Fetches basic profile information for the currently logged-in student."""
        student = g.current_user # Get the user object attached by @token_required
        try:
            profile_data = {
                "id": student.id,
                "username": student.username,
                "role": student.role.value,
                # Add other non-sensitive fields if needed (e.g., email if you add it to the model)
                # "email": student.email
            }
            return jsonify(profile_data), 200
        except Exception as e:
            print(f"Error fetching profile for user {student.id}: {e}")
            return jsonify({"message": "Error retrieving profile information."}), 500
    
    @app.route('/api/student/profile/edit', methods=['POST'])
    @student_required
    def edit_student_profile():
        """Allows the currently logged-in student to update their username and/or password."""
        student = g.current_user  # Get the user object attached by @token_required
        data = request.get_json()

        if not data:
            return jsonify({"message": "No update data provided."}), 400

        updated_fields = [] # Keep track of what was changed for the response message
        errors = {} # Collect potential validation errors

        # --- Username Update Logic ---
        new_username = data.get('username')
        if new_username is not None: # Check if username was provided in the request
            new_username = new_username.strip()
            if not new_username:
                errors['username'] = "Username cannot be empty."
            elif len(new_username) < 3:
                errors['username'] = "Username must be at least 3 characters long."
            elif new_username != student.username:
                # Check if the new username is already taken by ANOTHER user
                existing_user = User.query.filter(User.username == new_username, User.id != student.id).first()
                if existing_user:
                    errors['username'] = "This username is already taken. Please choose another."
                else:
                    student.username = new_username
                    updated_fields.append("username")
            # If new_username is the same as the current one, do nothing for username

        # --- Password Update Logic ---
        new_password = data.get('password')
        if new_password: # Check if a new password string was provided (and is not empty)
            if len(new_password) < 6:
                errors['password'] = "Password must be at least 6 characters long."
            else:
                # Hash the new password using the model's method
                student.set_password(new_password)
                updated_fields.append("password")
        # If password field is missing or empty, the password remains unchanged.

        # --- Final Validation and Commit ---
        if errors:
            # If there were validation errors, return them
            return jsonify({"message": "Update failed due to validation errors.", "errors": errors}), 400

        if not updated_fields:
            # If no fields were provided or the provided data didn't result in a change
            return jsonify({"message": "No changes detected or no new data provided."}), 200 # Or 400 if you prefer

        try:
            # Attempt to save changes to the database
            db.session.commit()
            print(f"--- Profile updated for User ID: {student.id}. Fields changed: {', '.join(updated_fields)} ---")

            # Return success response, potentially with updated non-sensitive info
            updated_profile_data = {
                "id": student.id,
                "username": student.username,
                "role": student.role.value
            }
            return jsonify({
                "message": f"Profile updated successfully. ({', '.join(updated_fields)} changed)",
                "user": updated_profile_data
                }), 200

        except Exception as e:
            # Handle potential database errors during commit
            db.session.rollback()
            print(f"!!! DATABASE ERROR updating profile for user {student.id}: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({"message": "An internal error occurred while saving profile changes."}), 500


    # --- MODIFIED: Proctoring Analysis Route (Face Count + Head Pose) ---
    @app.route('/api/proctor/analyze_frame', methods=['POST'])
    @student_required
    def analyze_frame():
        user_id = g.current_user.id
        data = request.get_json()

        if not data or 'frameData' not in data:
            return jsonify({"message": "Missing frame data"}), 400

        try:
            # --- Image Decoding ---
            header, encoded = data['frameData'].split(",", 1)
            image_data = base64.b64decode(encoded)
            np_arr = np.frombuffer(image_data, np.uint8)
            img_bgr = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

            if img_bgr is None:
                 print(f"[User {user_id}] Failed to decode image")
                 # Ensure user state exists before potentially returning error
                 with proctoring_lock:
                    if user_id not in proctoring_violations:
                        proctoring_violations[user_id] = {'no_face_streak': 0, 'multi_face_streak': 0, 'head_pose_score': 0.0}
                 # Return some default non-cheating state on decode failure? Or error?
                 # Returning error seems better.
                 return jsonify({"cheating_detected": False, "reason": "Image decode failed", "score": 0.0}), 400

            img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
            img_h, img_w, _ = img_rgb.shape # Get image dimensions


            # --- 1. Face Count Detection ---
            face_count_results = face_detector.process(img_rgb)
            num_faces = 0
            if face_count_results.detections:
                num_faces = len(face_count_results.detections)

            # --- 2. Head Pose Estimation (if exactly 1 face) ---
            head_pitch = 0.0
            head_yaw = 0.0
            head_is_away = False
            landmarks_found = False

            if num_faces == 1:
                # Process with Face Mesh
                mesh_results = face_mesh.process(img_rgb)
                if mesh_results.multi_face_landmarks:
                    landmarks_found = True
                    # Assuming only one face mesh found due to max_num_faces=1
                    face_landmarks = mesh_results.multi_face_landmarks[0]

                    face_2d = []
                    face_3d = []

                    # Extract specific landmarks
                    for idx, lm in enumerate(face_landmarks.landmark):
                        if idx in FACE_POSE_LANDMARK_IDS:
                            # Get 2D coords (image pixel space)
                            x, y = int(lm.x * img_w), int(lm.y * img_h)
                            face_2d.append([x, y])
                            # Get 3D coords (relative depth from mesh) - scale Z appropriately
                            # Using lm.z * img_w is a common heuristic, might need tuning
                            face_3d.append([x, y, lm.z * img_w]) # Adjust Z scaling if needed

                    if len(face_2d) == len(FACE_POSE_LANDMARK_IDS) and len(face_3d) == len(FACE_POSE_LANDMARK_IDS):
                        face_2d = np.array(face_2d, dtype=np.float64)
                        face_3d = np.array(face_3d, dtype=np.float64)

                        # Camera matrix (simplified)
                        focal_length = img_w # Or img_h, often approx image width/height
                        cam_matrix = np.array([[focal_length, 0, img_h / 2],
                                               [0, focal_length, img_w / 2],
                                               [0, 0, 1]])
                        # Distortion matrix (assuming none)
                        dist_matrix = np.zeros((4, 1), dtype=np.float64)

                        # Solve PnP
                        success, rot_vec, trans_vec = cv2.solvePnP(face_3d, face_2d, cam_matrix, dist_matrix)

                        if success:
                            # Get rotation matrix
                            rmat, _ = cv2.Rodrigues(rot_vec)
                            # Get Euler angles
                            angles, _, _, _, _, _ = cv2.RQDecomp3x3(rmat)
                            # angles[0] = pitch (x-rotation), angles[1] = yaw (y-rotation), angles[2] = roll (z-rotation)
                            head_pitch = angles[0]
                            head_yaw = angles[1]

                            # Check thresholds
                            if head_yaw < -HEAD_POSE_YAW_THRESHOLD or head_yaw > HEAD_POSE_YAW_THRESHOLD:
                                head_is_away = True
                            elif head_pitch < HEAD_POSE_PITCH_THRESHOLD: # Looking down too much
                                head_is_away = True
                    else:
                         print(f"[User {user_id}] solvePnP failed")
                         head_is_away = True # Treat failure as potential issue? Or ignore? Let's ignore for now. head_is_away = False
                else:
                    # Mesh detected 1 face, but no landmarks found (rare but possible)
                    print(f"[User {user_id}] Face mesh found no landmarks despite 1 face detected earlier.")
                    # Treat as if head is away? Or ignore? Let's ignore for now.
                    head_is_away = False # Ignore if landmarks fail


            # --- 3. Update Violation State & Determine Cheating ---
            cheating_detected = False
            reason = "OK"
            current_score = 0.0 # Default score

            with proctoring_lock:
                # Ensure user entry exists
                if user_id not in proctoring_violations:
                     proctoring_violations[user_id] = {'no_face_streak': 0, 'multi_face_streak': 0, 'head_pose_score': 0.0}
                     print(f"[User {user_id}] Re-initialized proctoring state during analysis.")

                state = proctoring_violations[user_id]
                previous_score = state.get('head_pose_score', 0.0) # Get previous score

                # Update Face Count Streaks
                if num_faces == 0:
                    state['no_face_streak'] += 1
                    state['multi_face_streak'] = 0
                    state['head_pose_score'] = 0.0 # Reset score if face disappears
                    if state['no_face_streak'] >= MAX_CONSECUTIVE_NO_FACE:
                        cheating_detected = True
                        reason = f"No face detected ({state['no_face_streak']}/{MAX_CONSECUTIVE_NO_FACE})"
                elif num_faces > 1:
                    state['multi_face_streak'] += 1
                    state['no_face_streak'] = 0
                    state['head_pose_score'] = 0.0 # Reset score if multiple faces
                    if state['multi_face_streak'] >= MAX_CONSECUTIVE_MULTI_FACE:
                        cheating_detected = True
                        reason = f"Multiple faces detected ({state['multi_face_streak']}/{MAX_CONSECUTIVE_MULTI_FACE})"
                else: # Exactly one face
                    state['no_face_streak'] = 0
                    state['multi_face_streak'] = 0

                    # Update Head Pose Score
                    violation_level = 1 if head_is_away else 0
                    state['head_pose_score'] = update_cheat_score(
                        violation_level,
                        previous_score,
                        HEAD_POSE_SCORE_INCREASE_FACTOR,
                        HEAD_POSE_SCORE_DECREASE_FACTOR
                    )
                    current_score = state['head_pose_score'] # Store current score for response

                    # Check Head Pose Threshold *only if not already flagged by face count*
                    if not cheating_detected and current_score >= HEAD_POSE_SCORE_THRESHOLD:
                         cheating_detected = True
                         if head_yaw < -HEAD_POSE_YAW_THRESHOLD or head_yaw > HEAD_POSE_YAW_THRESHOLD:
                              reason = f"Head turned away (Score: {current_score:.2f}/{HEAD_POSE_SCORE_THRESHOLD:.2f})"
                         elif head_pitch < HEAD_POSE_PITCH_THRESHOLD:
                              reason = f"Head looking down (Score: {current_score:.2f}/{HEAD_POSE_SCORE_THRESHOLD:.2f})"
                         else: # Should ideally not happen if score is high, but fallback
                              reason = f"Suspicious head pose detected (Score: {current_score:.2f}/{HEAD_POSE_SCORE_THRESHOLD:.2f})"

                # Debugging log
                # print(f"[User {user_id}] Faces: {num_faces}, Away: {head_is_away}, Pitch: {head_pitch:.1f}, Yaw: {head_yaw:.1f}, Score: {state.get('head_pose_score', 0.0):.2f}, Cheat: {cheating_detected}")


            # --- 4. Return Result ---
            return jsonify({
                "cheating_detected": cheating_detected,
                "reason": reason,
                "num_faces": num_faces,
                "head_pose_score": current_score # Send score back to frontend
            })

        except base64.binascii.Error:
             print(f"[User {user_id}] Invalid Base64 data received.")
             return jsonify({"message": "Invalid base64 data"}), 400
        except Exception as e:
            print(f"Error during proctoring analysis for user {user_id}: {type(e).__name__} - {e}")
            # Attempt to return a non-cheating status on unexpected error? Or error?
            # Let's return error to make frontend aware of issues.
            return jsonify({"message": "Error processing frame"}), 500


    # --- Database Initialization Command (Flask CLI) ---
    # ... (NO CHANGES) ...
    @app.cli.command("init-db")
    def init_db_command():
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

# --- Run the Flask Development Server ---
if __name__ == '__main__':
    app = create_app()
    app.run(debug=True, port=5001, threaded=True) # Use threaded=True