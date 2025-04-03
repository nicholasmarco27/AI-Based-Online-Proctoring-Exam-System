# backend/models.py
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
import enum
import json # To handle options storage

db = SQLAlchemy()

class RoleEnum(enum.Enum):
    # ... (keep existing RoleEnum)
    ADMIN = 'admin'
    STUDENT = 'student'

class User(db.Model):
    # ... (keep existing User model)
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False) # Increased length for hash
    role = db.Column(db.Enum(RoleEnum), nullable=False, default=RoleEnum.STUDENT)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def __repr__(self):
        return f'<User {self.username}>'

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'role': self.role.value
        }


class ExamStatusEnum(enum.Enum):
    # ... (keep existing ExamStatusEnum)
    DRAFT = 'Draft'
    PUBLISHED = 'Published'
    ARCHIVED = 'Archived'

# --- New Question Model ---
class Question(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    exam_id = db.Column(db.Integer, db.ForeignKey('exam.id'), nullable=False)
    text = db.Column(db.Text, nullable=False)
    # Store options as a JSON string (list of strings) for simplicity
    options_json = db.Column(db.Text, nullable=False)
    # Store the correct answer as one of the strings from the options list
    correct_answer = db.Column(db.String(255), nullable=False)
    # Add points if needed: points = db.Column(db.Integer, default=1)

    # Back-reference in Exam model will be named 'questions'
    exam = db.relationship('Exam', back_populates='questions')

    @property
    def options(self):
        """Get options as a Python list."""
        return json.loads(self.options_json)

    @options.setter
    def options(self, value):
        """Set options from a Python list."""
        if not isinstance(value, list):
            raise ValueError("Options must be a list")
        self.options_json = json.dumps(value)

    def __repr__(self):
        return f'<Question {self.id} for Exam {self.exam_id}>'

    def to_dict(self):
        return {
            'id': self.id,
            'exam_id': self.exam_id,
            'text': self.text,
            'options': self.options, # Use the property to get list
            'correct_answer': self.correct_answer,
            # 'points': self.points,
        }

class Exam(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    subject = db.Column(db.String(100), nullable=False)
    duration = db.Column(db.Integer) # In minutes
    status = db.Column(db.Enum(ExamStatusEnum), nullable=False, default=ExamStatusEnum.DRAFT)

    # --- NEW FIELDS ---
    allowed_attempts = db.Column(db.Integer, nullable=False, default=1) # Default to 1 attempt

    # --- Add relationship to Question ---
    # cascade="all, delete-orphan": delete questions when exam is deleted
    questions = db.relationship('Question', back_populates='exam', lazy=True, cascade="all, delete-orphan")
    
    def __repr__(self):
        return f'<Exam {self.name}>'

    def to_dict(self, include_questions=False):
        # --- Update serialization ---
        data = {
            'id': self.id,
            'name': self.name,
            'subject': self.subject,
            'duration': self.duration,
            'status': self.status.value,
            # Format dates to ISO string (or None). Frontend needs to handle None.
            # Use isoformat() which includes timezone info if the datetime object has it (SQLAlchemy usually stores timezone-naive in SQLite)
            'allowed_attempts': self.allowed_attempts,
            # Keep dummy fields needed by frontend for now
            'startDate': 'N/A', # No longer relevant, keep or remove? Let's remove from core dict
            'students': 0, # This would require tracking submissions/assignments
             # For StudentAvailableExams card (can be refined)
            'availableFrom': 'N/A', # No longer relevant
            'availableTo': 'N/A',   # No longer relevant
            'attemptsTaken': 0, # Needs real submission tracking later
        }

        if include_questions:
             # Serialize related questions if requested
             data['questions'] = [q.to_dict() for q in self.questions]
        return data