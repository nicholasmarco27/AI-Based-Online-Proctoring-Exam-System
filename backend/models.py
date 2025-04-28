# backend/models.py
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
import enum
import json # To handle JSON storage for options/answers
from datetime import datetime, timezone # Use timezone-aware datetimes
import logging # Use logging for warnings
from sqlalchemy.orm import joinedload, selectinload, relationship

# Get the logger instance
log = logging.getLogger(__name__)

db = SQLAlchemy()

# --- Association Table: User <-> UserGroup ---
user_group_membership = db.Table('user_group_membership',
    db.Column('user_id', db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), primary_key=True), # Added ondelete
    db.Column('group_id', db.Integer, db.ForeignKey('user_group.id', ondelete='CASCADE'), primary_key=True) # Added ondelete
)

# --- Association Table: Exam <-> UserGroup ---
exam_group_assignment = db.Table('exam_group_assignment',
    db.Column('exam_id', db.Integer, db.ForeignKey('exam.id', ondelete='CASCADE'), primary_key=True), # Added ondelete
    db.Column('group_id', db.Integer, db.ForeignKey('user_group.id', ondelete='CASCADE'), primary_key=True) # Added ondelete
)

class RoleEnum(enum.Enum):
    ADMIN = 'admin'
    STUDENT = 'student'

class User(db.Model):
    __tablename__ = 'user' # Explicit table name
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False) # Increased length for hash
    role = db.Column(db.Enum(RoleEnum), nullable=False, default=RoleEnum.STUDENT)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)) # Use timezone=True

    # Relationships
    # When a user is deleted, their submissions are also deleted
    submissions = db.relationship('ExamSubmission', back_populates='student', lazy='dynamic', cascade="all, delete-orphan")

    # Many-to-many relationship to UserGroup
    # When a user is deleted, their membership entries are removed (handled by cascade on ForeignKey in table)
    groups = db.relationship(
        'UserGroup',
        secondary=user_group_membership,
        lazy='subquery', # Efficiently loads groups when user is loaded
        back_populates='students' # Links back from UserGroup.students
    )

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def __repr__(self):
        return f'<User {self.username}>'

    def to_dict(self, include_groups=False):
        """Serializes the User object to a dictionary."""
        data = {
            'id': self.id,
            'username': self.username,
            'role': self.role.value,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
        if include_groups:
            # Include only basic group info
            # Add check for self.groups in case relationship loading fails (unlikely with subquery)
            try:
                data['groups'] = [{'id': g.id, 'name': g.name} for g in self.groups or []]
            except Exception as e:
                log.error(f"Error serializing groups for User ID {self.id}: {e}", exc_info=True) # Log traceback
                data['groups'] = [] # Gracefully handle error
        return data

# Di models.py
from datetime import datetime, timezone

class NotificationType(enum.Enum):
    EXAM_SUBMITTED = "exam_submitted"
    EXAM_CANCELLED_PROCTORING = "exam_cancelled_proctoring"
    # Tambahkan tipe lain jika perlu

class NotificationLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    type = db.Column(db.Enum(NotificationType), nullable=False)
    message = db.Column(db.String, nullable=False) # Pesan notifikasi yg akan ditampilkan

    # Relasi (opsional tapi berguna)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True) # User terkait (misal: siswa)
    user = db.relationship('User', backref=db.backref('notifications', lazy=True))

    exam_id = db.Column(db.Integer, db.ForeignKey('exam.id'), nullable=True) # Ujian terkait
    exam = db.relationship('Exam', backref=db.backref('notifications', lazy=True))

    # Data tambahan spesifik per tipe (bisa disimpan di message atau kolom terpisah)
    # Misalnya, untuk EXAM_SUBMITTED: score
    # Misalnya, untuk EXAM_CANCELLED: reason
    details = db.Column(db.JSON, nullable=True) # Kolom JSON untuk data fleksibel

    def __repr__(self):
        return f'<NotificationLog {self.id} - {self.type.value} - {self.timestamp}>'

    def to_dict(self):
        # Sertakan username jika user ada
        username = self.user.username if self.user else "Unknown User"
        exam_name = self.exam.name if self.exam else "Unknown Exam" # Perlu relasi exam

        # Format pesan yang lebih baik berdasarkan tipe
        formatted_message = self.message # Default
        if self.type == NotificationType.EXAM_SUBMITTED:
             score = self.details.get('score', 'N/A') if self.details else 'N/A'
             subject = self.exam.subject if self.exam else 'Unknown Subject' # Ambil subject dari exam
             formatted_message = f"User '{username}' scored {score:.2f}% on exam '{exam_name}' ({subject})."
        elif self.type == NotificationType.EXAM_CANCELLED_PROCTORING:
             reason = self.details.get('reason', 'Unknown') if self.details else 'Unknown'
             formatted_message = f"Exam '{exam_name}' for user '{username}' was cancelled due to proctoring violation: {reason}."

        return {
            'id': self.id,
            'timestamp': self.timestamp.isoformat(),
            'type': self.type.value,
            'message': formatted_message, # Kirim pesan yang sudah diformat
            'userId': self.user_id,
            'username': username,
            'examId': self.exam_id,
            'examName': exam_name,
            'details': self.details
        }
    
class UserGroup(db.Model):
    __tablename__ = 'user_group' # Explicit table name
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)
    description = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)) # Use timezone=True

    # Many-to-many relationship back to User
    students = db.relationship(
        'User',
        secondary=user_group_membership,
        lazy='subquery',
        back_populates='groups'
    )

    # Many-to-many relationship to Exam
    exams = db.relationship(
        'Exam',
        secondary=exam_group_assignment,
        lazy='subquery',
        back_populates='assigned_groups' # Matches Exam.assigned_groups
    )

    def __repr__(self):
        return f'<UserGroup {self.name}>'

    def to_dict(self, include_students=False, include_exams=False):
        """Serializes the UserGroup object to a dictionary."""
        student_count = 0
        try:
             # Calculate count safely
             student_count = len(self.students) if self.students else 0
        except Exception as e:
            log.warning(f"Could not determine student count for Group ID {self.id}: {e}")

        data = {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'student_count': student_count
        }
        if include_students:
            try:
                data['students'] = [{'id': s.id, 'username': s.username} for s in self.students or []]
            except Exception as e:
                log.error(f"Error serializing students for Group ID {self.id}: {e}", exc_info=True) # Log traceback
                data['students'] = []
        if include_exams: # Optional: Serialize assigned exams if needed
            try:
                 data['exams'] = [{'id': e.id, 'name': e.name} for e in self.exams or []]
            except Exception as e:
                 log.error(f"Error serializing exams for Group ID {self.id}: {e}", exc_info=True) # Log traceback
                 data['exams'] = []
        return data

# --- Exam Related Models ---

class ExamStatusEnum(enum.Enum):
    DRAFT = 'Draft'         # Exam is being created, not visible to students
    PUBLISHED = 'Published' # Exam is available for students (or specific groups)
    ARCHIVED = 'Archived'   # Exam is finished, results stored, not available

class Question(db.Model):
    __tablename__ = 'question' # Explicit table name
    id = db.Column(db.Integer, primary_key=True)
    exam_id = db.Column(db.Integer, db.ForeignKey('exam.id', ondelete='CASCADE'), nullable=False) # Added ondelete
    text = db.Column(db.Text, nullable=False)
    # Store options as a JSON string for variable number of options
    options_json = db.Column(db.Text, nullable=False)
    # Store the correct answer text (must match one of the options)
    correct_answer = db.Column(db.Text, nullable=False)

    # Relationship back to Exam
    exam = db.relationship('Exam', back_populates='questions')

    @property
    def options(self):
        """Get options as a Python list."""
        # Ensure options_json is not None before trying to load
        if self.options_json is None:
            return []
        try:
            # Handle potential non-string values before loading
            if isinstance(self.options_json, bytes):
                options_str = self.options_json.decode('utf-8')
            else:
                options_str = str(self.options_json)
            return json.loads(options_str)
        except (json.JSONDecodeError, TypeError) as e:
            # Log the error for better debugging
            log.warning(f"Could not decode options_json for Question ID {self.id}. Value: '{self.options_json}'. Error: {e}")
            return [] # Return empty list if invalid JSON or None
        except Exception as e:
            log.error(f"Unexpected error decoding options for Question ID {self.id}: {e}", exc_info=True)
            return []

    @options.setter
    def options(self, value):
        """Set options from a Python list."""
        if not isinstance(value, list):
            raise ValueError("Options must be a list")
        # Store non-empty, stripped strings
        self.options_json = json.dumps([str(opt).strip() for opt in value if str(opt).strip()])

    def __repr__(self):
        return f'<Question {self.id} for Exam {self.exam_id}>'

    def to_dict(self):
        """Serializes the Question object to a dictionary."""
        # Use try-except when accessing the property just in case
        opts = []
        try:
            opts = self.options
        except Exception as e:
            log.error(f"Error accessing options property for Question ID {self.id}: {e}", exc_info=True)

        return {
            'id': self.id,
            'exam_id': self.exam_id,
            'text': self.text,
            'options': opts, # Use the safe value
            'correct_answer': self.correct_answer,
        }

class Exam(db.Model):
    __tablename__ = 'exam' # Explicit table name
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    subject = db.Column(db.String(100), nullable=True) # Allow subject to be optional?
    duration = db.Column(db.Integer, nullable=False) # Duration in minutes
    status = db.Column(db.Enum(ExamStatusEnum), nullable=False, default=ExamStatusEnum.DRAFT)
    allowed_attempts = db.Column(db.Integer, nullable=False, default=1) # Default to 1 attempt
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)) # Added created_at

    # Relationships
    # Use lazy='dynamic' for large collections you might filter/count later
    questions = db.relationship('Question', back_populates='exam', lazy='dynamic', cascade="all, delete-orphan")
    submissions = db.relationship('ExamSubmission', back_populates='exam', lazy='dynamic', cascade="all, delete-orphan")

    # Many-to-many relationship to UserGroup
    assigned_groups = db.relationship(
        'UserGroup',
        secondary=exam_group_assignment,
        lazy='subquery', # Load groups efficiently when exam is loaded
        back_populates='exams' # Matches UserGroup.exams
    )

    def __repr__(self):
        return f'<Exam {self.name} (ID: {self.id})>'

    def to_dict(self, include_questions=False, include_groups=False):
        """Serializes the Exam object to a dictionary."""
        question_count = 0
        try:
            # Correct usage with lazy='dynamic' - performs a count query safely
            question_count = self.questions.count()
        except Exception as e:
            log.warning(f"Could not count questions for Exam ID {self.id}: {e}")

        data = {
            'id': self.id,
            'name': self.name,
            'subject': self.subject,
            'duration': self.duration,
            'status': self.status.value if self.status else None, # Handle potential None status
            'allowed_attempts': self.allowed_attempts,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'question_count': question_count
        }

        if include_questions:
            # Serialize related questions if requested
            q_list = []
            try:
                 # Use .all() since questions relationship is lazy='dynamic'
                 # Wrap individual q.to_dict() calls to prevent one bad question stopping all
                 all_questions = self.questions.all() if self.questions else []
                 for q in all_questions:
                     try:
                         q_list.append(q.to_dict())
                     except Exception as q_e:
                         log.error(f"Error serializing Question ID {q.id} for Exam ID {self.id}: {q_e}", exc_info=True)
                 data['questions'] = q_list
            except Exception as e:
                 log.error(f"Error accessing questions relationship for Exam ID {self.id}: {e}", exc_info=True)
                 data['questions'] = [] # Return empty list or indicate error

        # Include assigned group IDs and names if requested
        if include_groups:
            try:
                 # Add check for self.assigned_groups
                 data['assigned_groups'] = [{'id': g.id, 'name': g.name} for g in self.assigned_groups or []]
            except Exception as e:
                 log.error(f"Error serializing assigned groups for Exam ID {self.id}: {e}", exc_info=True)
                 data['assigned_groups'] = [] # Return empty list or indicate error

        # Ensure return is outside the if blocks
        return data

    # Example helper methods (consider efficiency for large datasets)
    # def get_student_count(self):
    #     # Query distinct users from submissions for this exam
    #     return db.session.query(ExamSubmission.user_id).filter(ExamSubmission.exam_id == self.id).distinct().count()

    # def get_total_attempts_count(self):
    #     # Query total submissions for this exam
    #     return self.submissions.count() # Correct for lazy='dynamic'

class SubmissionStatusEnum(enum.Enum):
    COMPLETED = "Completed"
    CANCELLED_PROCTORING = "Cancelled (Proctoring)"
    # Add other statuses if needed later (e.g., IN_PROGRESS)

class ExamSubmission(db.Model):
    __tablename__ = 'exam_submission'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), nullable=False, index=True) # Added index
    exam_id = db.Column(db.Integer, db.ForeignKey('exam.id', ondelete='CASCADE'), nullable=False, index=True) # Added index
    submitted_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    score = db.Column(db.Float, nullable=True)
    correct_answers_count = db.Column(db.Integer, nullable=True)
    total_questions_count = db.Column(db.Integer, nullable=False) # Store total at time of submission/cancellation

    answers = db.Column(db.JSON, nullable=True)

    status = db.Column(db.Enum(SubmissionStatusEnum), nullable=False,
                       default=SubmissionStatusEnum.COMPLETED,
                       server_default=SubmissionStatusEnum.COMPLETED.value)

    # Relationships (using 'student' name consistently)
    student = db.relationship('User', back_populates='submissions', lazy='joined')
    exam = db.relationship('Exam', back_populates='submissions', lazy='joined')


    def __repr__(self):
     # Safely represent object even if relationships are not loaded or None
        user_repr = f"User ID: {self.user_id}"
        exam_repr = f"Exam ID: {self.exam_id}"
        try:
            if self.student:
                user_repr = self.student.username
        except Exception: pass # Ignore errors during repr
        try:
            if self.exam:
                exam_repr = self.exam.name
        except Exception: pass # Ignore errors during repr
        return f'<ExamSubmission ID: {self.id}, User: {user_repr}, Exam: {exam_repr}>'


    def to_dict(self):
        """Serializes the ExamSubmission object to a dictionary."""
        student_username = None
        exam_name = None
        try:
            if self.student:
                student_username = self.student.username
        except Exception as e:
             log.warning(f"Error accessing student username for Submission ID {self.id}: {e}", exc_info=True) # Add exc_info

        try:
            if self.exam:
                exam_name = self.exam.name
        except Exception as e:
            log.warning(f"Error accessing exam name for Submission ID {self.id}: {e}", exc_info=True) # Add exc_info


        return {
            'id': self.id,
            'userId': self.user_id, # Keep camelCase consistent with other APIs? Or use user_id? Be consistent.
            'examId': self.exam_id, # Keep camelCase consistent?
            'submittedAt': self.submitted_at.isoformat() if self.submitted_at else None,
            'score': self.score,
            'correctAnswers': self.correct_answers_count, # Keep camelCase consistent?
            'totalQuestions': self.total_questions_count, # Keep camelCase consistent?
            'answers': self.answers,
            'username': student_username, # Renamed from student_username for clarity?
            'examName': exam_name, # Keep camelCase consistent?
            'status': self.status.value if self.status else None,
        }