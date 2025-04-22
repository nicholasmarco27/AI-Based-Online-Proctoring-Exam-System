# backend/proctoring.py
import cv2 # OpenCV for image processing
import mediapipe as mp # For face detection and mesh
import numpy as np
import base64
import threading
import math # For atan2 in angle calculation (though not directly used in RQDecomp3x3, good to keep if needed later)
from datetime import datetime, timedelta # Potentially useful for future time-based analysis

# --- MediaPipe Initialization ---
mp_face_detection = mp.solutions.face_detection
mp_face_mesh = mp.solutions.face_mesh

# Using short-range model, confidence 0.5 for face counting
face_detector = mp_face_detection.FaceDetection(min_detection_confidence=0.45, model_selection=0)
# Face Mesh for head pose (use default settings initially)
face_mesh = mp_face_mesh.FaceMesh(max_num_faces=1, # Optimize: only process 1 face for pose
                                  min_detection_confidence=0.5,
                                  min_tracking_confidence=0.5)

# --- In-memory storage for proctoring violations ---
# WARNING: Lost on server restart. Use Redis or DB for persistence.
# Structure: { user_id: { 'no_face_streak': 0, 'multi_face_streak': 0, 'head_pose_score': 0.0 } }
proctoring_violations = {}
proctoring_lock = threading.Lock()

# --- Proctoring Configuration (Keep Tuning Parameters Here) ---
MAX_CONSECUTIVE_NO_FACE = 3
MAX_CONSECUTIVE_MULTI_FACE = 3
# Head Pose Thresholds (Degrees) - **TUNING REQUIRED**
HEAD_POSE_YAW_THRESHOLD = 15.0 # degrees left/right
HEAD_POSE_PITCH_THRESHOLD = -10.0 # degrees down (negative pitch)
# Cheating Score Calculation
HEAD_POSE_SCORE_INCREASE_FACTOR = 0.18 # Factor when head is away
HEAD_POSE_SCORE_DECREASE_FACTOR = 0.15 # Factor when head is forward
HEAD_POSE_SCORE_THRESHOLD = 0.60 # Threshold to trigger cheating flag
# Hysteresis (makes recovery slower if already flagged)
HYSTERESIS_DECREASE_FACTOR_MULTIPLIER = 0.5 # Multiplier for decrease factor when above threshold (Value < 1 -> slower decrease)

# Landmark IDs for solvePnP (similar to example)
FACE_POSE_LANDMARK_IDS = [33, 263, 1, 61, 291, 199] # Left eye, right eye, nose tip, left mouth corner, right mouth corner, chin


# --- Helper: Averaging function ---
def update_cheat_score(current_violation_level, previous_score, increase_factor, decrease_factor):
    """
    Updates the cheat score using a smoothing approach.
    current_violation_level: 1 if violation, 0 if no violation.
    previous_score: The score from the last frame.
    increase_factor: How much to add towards 1.0 if violation occurs.
    decrease_factor: How much to reduce towards 0.0 if no violation.
    """
    if current_violation_level > 0: # Increase score towards 1
        new_score = previous_score + increase_factor * (1.0 - previous_score)
    else: # Decrease score towards 0
        new_score = previous_score * (1.0 - decrease_factor)
    return max(0.0, min(1.0, new_score)) # Clamp the score between 0 and 1

# --- Functions Exposed to app.py ---

def initialize_proctoring_state(user_id):
    """Initializes or resets the proctoring state for a given user."""
    with proctoring_lock:
        proctoring_violations[user_id] = {
            'no_face_streak': 0,
            'multi_face_streak': 0,
            'head_pose_score': 0.0
        }
        print(f"[Proctoring] Initialized/Reset state for user {user_id}")

def clear_proctoring_state(user_id):
    """Removes the proctoring state for a given user."""
    with proctoring_lock:
        if user_id in proctoring_violations:
            del proctoring_violations[user_id]
            print(f"[Proctoring] Cleared state for user {user_id}")

def analyze_frame_proctoring(user_id, frame_data_url):
    """
    Analyzes a single frame for proctoring violations.
    Args:
        user_id: The ID of the user sending the frame.
        frame_data_url: The base64 encoded frame data string (e.g., "data:image/jpeg;base64,...").
    Returns:
        A dictionary containing the analysis results:
        {
            "success": bool,            # True if analysis completed, False on error
            "message": str,           # Error message if success is False
            "cheating_detected": bool, # Overall cheating flag
            "reason": str,            # Reason for the flag (or "OK")
            "num_faces": int,         # Number of faces detected
            "head_pose_score": float  # Current head pose score
        }
    """
    if not frame_data_url:
        return {"success": False, "message": "Missing frame data", "cheating_detected": False, "reason": "Input Error", "num_faces": 0, "head_pose_score": 0.0}

    try:
        # --- Image Decoding ---
        # ... (no changes needed here) ...
        try:
            header, encoded = frame_data_url.split(",", 1)
            image_data = base64.b64decode(encoded)
            np_arr = np.frombuffer(image_data, np.uint8)
            img_bgr = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        except (ValueError, base64.binascii.Error) as decode_err:
             print(f"[Proctoring User {user_id}] Invalid Base64 data: {decode_err}")
             return {"success": False, "message": "Invalid image data format", "cheating_detected": False, "reason": "Decode Error", "num_faces": 0, "head_pose_score": 0.0}
        if img_bgr is None:
            print(f"[Proctoring User {user_id}] Failed to decode image")
            return {"success": False, "message": "Image decode failed", "cheating_detected": False, "reason": "Decode Error", "num_faces": 0, "head_pose_score": 0.0}

        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        img_h, img_w, _ = img_rgb.shape

        # --- 1. Face Count Detection ---
        # ... (no changes needed here) ...
        face_count_results = face_detector.process(img_rgb)
        num_faces = 0
        if face_count_results.detections:
            num_faces = len(face_count_results.detections)

        # --- 2. Head Pose Estimation ---
        # ... (no changes needed here) ...
        head_pitch = 0.0; head_yaw = 0.0; landmarks_found = False
        yaw_violation = False; pitch_violation = False
        if num_faces == 1:
            mesh_results = face_mesh.process(img_rgb)
            if mesh_results.multi_face_landmarks:
                landmarks_found = True
                face_landmarks = mesh_results.multi_face_landmarks[0]; face_2d = []; face_3d = []
                for idx, lm in enumerate(face_landmarks.landmark):
                    if idx in FACE_POSE_LANDMARK_IDS:
                        x, y = int(lm.x * img_w), int(lm.y * img_h)
                        face_2d.append([x, y]); face_3d.append([x, y, lm.z * img_w])
                if len(face_2d) == len(FACE_POSE_LANDMARK_IDS) and len(face_3d) == len(FACE_POSE_LANDMARK_IDS):
                    face_2d = np.array(face_2d, dtype=np.float64); face_3d = np.array(face_3d, dtype=np.float64)
                    focal_length = img_w
                    cam_matrix = np.array([[focal_length, 0, img_h / 2], [0, focal_length, img_w / 2], [0, 0, 1]])
                    dist_matrix = np.zeros((4, 1), dtype=np.float64)
                    success, rot_vec, trans_vec = cv2.solvePnP(face_3d, face_2d, cam_matrix, dist_matrix)
                    if success:
                        rmat, _ = cv2.Rodrigues(rot_vec); angles, _, _, _, _, _ = cv2.RQDecomp3x3(rmat)
                        head_pitch = angles[0]; head_yaw = angles[1]
                        if head_yaw < -HEAD_POSE_YAW_THRESHOLD or head_yaw > HEAD_POSE_YAW_THRESHOLD: yaw_violation = True
                        if head_pitch < HEAD_POSE_PITCH_THRESHOLD: pitch_violation = True
                    else: print(f"[Proctoring User {user_id}] solvePnP failed"); yaw_violation = False; pitch_violation = False
                else: yaw_violation = False; pitch_violation = False
            else: print(f"[Proctoring User {user_id}] Face mesh found no landmarks."); yaw_violation = False; pitch_violation = False
        any_head_pose_violation = yaw_violation or pitch_violation

        # --- 3. Update Violation State & Determine Cheating ---
        cheating_detected = False
        reason = "OK"
        current_score = 0.0

        with proctoring_lock:
            if user_id not in proctoring_violations:
                 proctoring_violations[user_id] = {'no_face_streak': 0, 'multi_face_streak': 0, 'head_pose_score': 0.0}
                 print(f"[Proctoring User {user_id}] Re-initialized state during analysis.")

            state = proctoring_violations[user_id]
            previous_score = state.get('head_pose_score', 0.0)

            # Handle Face Count Violations
            no_face_violation_this_frame = (num_faces == 0)
            multi_face_violation_this_frame = (num_faces > 1)

            if no_face_violation_this_frame:
                state['no_face_streak'] += 1
                state['multi_face_streak'] = 0
                # state['head_pose_score'] = 0.0 # <-- OLD: Reset score to 0
                if state['no_face_streak'] >= MAX_CONSECUTIVE_NO_FACE:
                    if not cheating_detected: # Check if already detected this frame (unlikely but safe)
                        cheating_detected = True
                        reason = f"No face detected ({state['no_face_streak']}/{MAX_CONSECUTIVE_NO_FACE})"
                        # --- NEW: Reset score to threshold when warning triggers ---
                        state['head_pose_score'] = HEAD_POSE_SCORE_THRESHOLD
                        print(f"[Proctoring User {user_id}] No Face Warning! Score reset to {HEAD_POSE_SCORE_THRESHOLD}")
                else:
                    # If streak hasn't hit max, reset score to 0 as face isn't visible
                    state['head_pose_score'] = 0.0

            elif multi_face_violation_this_frame:
                state['multi_face_streak'] += 1
                state['no_face_streak'] = 0
                # state['head_pose_score'] = 0.0 # <-- OLD: Reset score to 0
                if state['multi_face_streak'] >= MAX_CONSECUTIVE_MULTI_FACE:
                     if not cheating_detected:
                        cheating_detected = True
                        reason = f"Multiple faces detected ({state['multi_face_streak']}/{MAX_CONSECUTIVE_MULTI_FACE})"
                        # --- NEW: Reset score to threshold when warning triggers ---
                        state['head_pose_score'] = HEAD_POSE_SCORE_THRESHOLD
                        print(f"[Proctoring User {user_id}] Multi-Face Warning! Score reset to {HEAD_POSE_SCORE_THRESHOLD}")
                else:
                     # If streak hasn't hit max, reset score to 0 as analysis isn't reliable
                    state['head_pose_score'] = 0.0

            else: # Exactly one face
                state['no_face_streak'] = 0
                state['multi_face_streak'] = 0

                # Update Head Pose Score
                target_level = 1.0 if any_head_pose_violation else 0.0
                is_currently_flagged = (previous_score >= HEAD_POSE_SCORE_THRESHOLD)

                current_increase_factor = HEAD_POSE_SCORE_INCREASE_FACTOR
                current_decrease_factor = HEAD_POSE_SCORE_DECREASE_FACTOR
                if is_currently_flagged:
                    # Apply hysteresis: slower decrease if already flagged
                    current_decrease_factor *= HYSTERESIS_DECREASE_FACTOR_MULTIPLIER

                # Calculate potential new score based on current state
                # Note: This calculation happens even if face count violations occurred,
                # but the result might be overridden below if a face count warning triggered.
                state['head_pose_score'] = update_cheat_score(
                    target_level, previous_score, current_increase_factor, current_decrease_factor
                )

                # Check Head Pose Score Threshold (only if not already flagged by face count)
                if not cheating_detected and state['head_pose_score'] >= HEAD_POSE_SCORE_THRESHOLD:
                    cheating_detected = True
                    # Determine reason based on specific violation
                    if yaw_violation and pitch_violation: reason = f"Head turned and looking down (Score: {state['head_pose_score']:.2f})"
                    elif yaw_violation: reason = f"Head turned away (Score: {state['head_pose_score']:.2f})"
                    elif pitch_violation: reason = f"Head looking down (Score: {state['head_pose_score']:.2f})"
                    else: reason = f"Suspicious head pose (Score: {state['head_pose_score']:.2f})" # Fallback

                    # --- NEW: Explicitly set score to threshold when head pose warning triggers ---
                    # Ensures score doesn't exceed threshold significantly in one step and aligns with other resets
                    state['head_pose_score'] = HEAD_POSE_SCORE_THRESHOLD
                    print(f"[Proctoring User {user_id}] Head Pose Warning! Score reset to {HEAD_POSE_SCORE_THRESHOLD}")


            # Get the final score from the state to return
            current_score = state.get('head_pose_score', 0.0)

            # Log state update (optional)
            # print(f"[Proctoring User {user_id}] F:{num_faces} YV:{yaw_violation} PV:{pitch_violation} Score:{current_score:.3f} Cheat:{cheating_detected} Reason:{reason}")

            # Package results for return
            return {
                "success": True,
                "message": "Analysis complete",
                "cheating_detected": cheating_detected,
                "reason": reason,
                "num_faces": num_faces,
                "head_pose_score": current_score # Return the potentially reset score
            }

    except Exception as e:
        # ... (error handling remains the same) ...
        print(f"!!! UNEXPECTED ERROR during proctoring analysis for user {user_id}: {type(e).__name__} - {e} !!!")
        import traceback
        traceback.print_exc()
        return {"success": False, "message": "Internal server error during analysis", "cheating_detected": False, "reason": "Server Error", "num_faces": 0, "head_pose_score": 0.0}