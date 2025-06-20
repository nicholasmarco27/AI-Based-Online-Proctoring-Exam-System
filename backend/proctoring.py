# backend/proctoring.py
import cv2 # OpenCV for image processing
import mediapipe as mp
import numpy as np
import base64
import threading
import math 
from datetime import datetime, timedelta

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
# Structure: { user_id: { 'no_face_streak': 0, 'multi_face_streak': 0, 'cheat_percentage': 0.0, 'global_cheat_flag': 0, 'head_pose_violation_streak': 0 } }
proctoring_violations = {}
proctoring_lock = threading.Lock()

# --- Proctoring Configuration (TUNED TO MATCH YOUR "WORKING" DETECTION.PY LOGIC) ---
MAX_CONSECUTIVE_NO_FACE = 3
MAX_CONSECUTIVE_MULTI_FACE = 3

# Head Pose Thresholds (Based on your "working" code's explicit values and angle scaling)
# Angles are scaled by 360 after RQDecomp3x3, so these thresholds are relative to that scale.
HEAD_POSE_YAW_THRESHOLD = 50.0  # degrees left/right
HEAD_POSE_PITCH_DOWN_THRESHOLD = -15.0 # degrees down (negative pitch)
# Your "working" code did not have an explicit threshold for looking UP.
HEAD_POSE_PITCH_UP_THRESHOLD = 7000.0 # Effectively disables looking up detection by setting a very high threshold

# Cheating Score Threshold (from your "working" detection.py: CHEAT_THRESH)
CHEAT_THRESH = 0.6

# --- Streak-based Penalty Configuration ---
STREAK_PENALTY_INCREMENT = 0.3 # How much to add to 'current_val_for_avg' per streak frame
MAX_HEAD_POSE_STREAK_PENALTY = 5 # Cap the streak penalty effect to avoid extreme values too quickly

# --- NEW: Fast Decay Configuration for Recovery ---
FAST_DECAY_DIVISOR = 1.05 # Original is 1.01. A larger divisor means faster decay (e.g., previous / 1.05)

# Landmark IDs for solvePnP (matches your working snippet)
FACE_POSE_LANDMARK_IDS = [33, 263, 1, 61, 291, 199] # Left eye, right eye, nose tip, left mouth corner, right mouth corner, chin


# --- Helper: 'avg' function copied directly from your detection.py ---
def avg(current, previous, is_recovering_from_flagged=False): # Added new parameter
    """
    Custom smoothing function from your detection.py.
    NOTE: This is not a standard averaging and has specific behaviors
    like hard capping at 0.65 and incremental growth.
    """
    if previous > 1: # This condition suggests 'previous' might exceed 1, which the new logic allows.
        return 0.65
    if current == 0:
        if previous < 0.01:
            return 0.01
        # Apply faster decay if recovering from flagged state
        if is_recovering_from_flagged:
            return previous / FAST_DECAY_DIVISOR # Use the faster decay divisor
        else:
            return previous / 1.01 # Original slow decay
    if previous == 0:
        return current
    return 1 * previous + 0.1 * current # This is 'previous + 0.1 * current', which can cause rapid increase.

# --- Functions Exposed to app.py ---

def initialize_proctoring_state(user_id):
    """Initializes or resets the proctoring state for a given user."""
    with proctoring_lock:
        proctoring_violations[user_id] = {
            'no_face_streak': 0,
            'multi_face_streak': 0,
            'cheat_percentage': 0.0,    # Corresponds to PERCENTAGE_CHEAT
            'global_cheat_flag': 0,     # Corresponds to GLOBAL_CHEAT
            'head_pose_violation_streak': 0 # Initialize head pose streak
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
        A dictionary containing the analysis results.
    """
    if not frame_data_url:
        return {"success": False, "message": "Missing frame data", "cheating_detected": False, "reason": "Input Error", "num_faces": 0, "head_pose_score": 0.0}

    try:
        # --- Image Decoding ---
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
        face_count_results = face_detector.process(img_rgb)
        num_faces = 0
        if face_count_results.detections:
            num_faces = len(face_count_results.detections)

        # --- 2. Head Pose Estimation ---
        head_pitch = 0.0; head_yaw = 0.0; 
        yaw_violation_flag = 0; pitch_violation_flag = 0 # 0 or 1, like X_AXIS_CHEAT/Y_AXIS_CHEAT
        
        if num_faces == 1:
            mesh_results = face_mesh.process(img_rgb)
            if mesh_results.multi_face_landmarks:
                face_landmarks = mesh_results.multi_face_landmarks[0]; face_2d = []; face_3d = []
                for idx, lm in enumerate(face_landmarks.landmark):
                    if idx in FACE_POSE_LANDMARK_IDS:
                        x, y = int(lm.x * img_w), int(lm.y * img_h)
                        face_2d.append([x, y])
                        # Use lm.z directly, as in your working code's face_3d append
                        face_3d.append([x, y, lm.z]) 
                
                if len(face_2d) == len(FACE_POSE_LANDMARK_IDS) and len(face_3d) == len(FACE_POSE_LANDMARK_IDS):
                    face_2d = np.array(face_2d, dtype=np.float64)
                    face_3d = np.array(face_3d, dtype=np.float64)
                    
                    # Focal length and camera matrix (cx, cy to standard img_w/2, img_h/2)
                    focal_length = 1.0 * img_w 
                    cam_matrix = np.array([[focal_length, 0, img_w / 2], # cx = img_w / 2
                                           [0, focal_length, img_h / 2], # cy = img_h / 2
                                           [0, 0, 1]])
                    dist_matrix = np.zeros((4, 1), dtype=np.float64)
                    
                    success, rot_vec, trans_vec = cv2.solvePnP(face_3d, face_2d, cam_matrix, dist_matrix)
                    if success:
                        rmat, _ = cv2.Rodrigues(rot_vec)
                        angles, _, _, _, _, _ = cv2.RQDecomp3x3(rmat)
                        
                        # Apply the 360 scaling from your "working" code's pose() function
                        head_pitch = angles[0] * 360 # Corresponds to 'x' in your pose()
                        head_yaw = angles[1] * 360   # Corresponds to 'y' in your pose()

                        # --- DEBUG PRINTS ---
                        print(f"[Proctoring User {user_id}] Head Pose Debug: Pitch={head_pitch:.2f}, Yaw={head_yaw:.2f}")
                        print(f"[Proctoring User {user_id}]   Yaw Threshold={HEAD_POSE_YAW_THRESHOLD}. |Yaw|={abs(head_yaw):.2f}. Yaw Violation Trigger: {abs(head_yaw) > HEAD_POSE_YAW_THRESHOLD}")
                        print(f"[Proctoring User {user_id}]   Pitch Down Thresh={HEAD_POSE_PITCH_DOWN_THRESHOLD}, Pitch Up Thresh={HEAD_POSE_PITCH_UP_THRESHOLD}. Pitch Violation Trigger: {head_pitch < HEAD_POSE_PITCH_DOWN_THRESHOLD or head_pitch > HEAD_POSE_PITCH_UP_THRESHOLD}")
                        # --- END DEBUG PRINTS ---

                        # Determine head pose violation flags (X_AXIS_CHEAT, Y_AXIS_CHEAT equivalents)
                        if abs(head_yaw) > HEAD_POSE_YAW_THRESHOLD:
                            yaw_violation_flag = 1
                        
                        # Pitch violation: Only checks for looking down as per your working code's logic (x < -5)
                        if head_pitch < HEAD_POSE_PITCH_DOWN_THRESHOLD:
                            pitch_violation_flag = 1
                    else:
                        print(f"[Proctoring User {user_id}] solvePnP failed - Could not estimate pose.")
                else:
                    print(f"[Proctoring User {user_id}] Not enough landmarks for solvePnP: 2D={len(face_2d)}, 3D={len(face_3d)}. Expected {len(FACE_POSE_LANDMARK_IDS)}")
            else:
                print(f"[Proctoring User {user_id}] No face landmarks found by MediaPipe Face Mesh.")
        else:
            print(f"[Proctoring User {user_id}] No single face detected for pose estimation (num_faces={num_faces}).")


        # --- 3. Update Violation State & Determine Cheating ---
        cheating_detected = False
        reason = "OK"
        
        with proctoring_lock:
            if user_id not in proctoring_violations:
                proctoring_violations[user_id] = {
                    'no_face_streak': 0, 'multi_face_streak': 0, 
                    'cheat_percentage': 0.0, 'global_cheat_flag': 0,
                    'head_pose_violation_streak': 0
                }
                print(f"[Proctoring User {user_id}] Re-initialized state during analysis (was missing).")

            state = proctoring_violations[user_id]
            current_cheat_percentage = state.get('cheat_percentage', 0.0)
            current_global_cheat_flag = state.get('global_cheat_flag', 0)
            current_head_pose_streak = state.get('head_pose_violation_streak', 0)
            
            # Placeholder for audio cheat flag (not implemented in this file)
            audio_cheat_flag = 0 

            # --- Apply face count logic first, as it overrides head pose and resets streak ---
            no_face_violation_this_frame = (num_faces == 0)
            multi_face_violation_this_frame = (num_faces > 1)

            if no_face_violation_this_frame:
                state['no_face_streak'] += 1
                state['multi_face_streak'] = 0 # Reset other streak
                state['head_pose_violation_streak'] = 0 # Reset head pose streak on face count issue

                if state['no_face_streak'] >= MAX_CONSECUTIVE_NO_FACE:
                    cheating_detected = True
                    reason = f"No face detected ({state['no_face_streak']}/{MAX_CONSECUTIVE_NO_FACE})"
                    current_cheat_percentage = CHEAT_THRESH # Force cheat_percentage to threshold if severe no-face detected
                    current_global_cheat_flag = 1 # Consider this a global cheat
                    print(f"[Proctoring User {user_id}] VIOLATION: No Face ({state['no_face_streak']}x)! Cheat percentage forced to {current_cheat_percentage:.2f}")

            elif multi_face_violation_this_frame:
                state['multi_face_streak'] += 1
                state['no_face_streak'] = 0 # Reset other streak
                state['head_pose_violation_streak'] = 0 # Reset head pose streak on face count issue

                if state['multi_face_streak'] >= MAX_CONSECUTIVE_MULTI_FACE:
                    cheating_detected = True
                    reason = f"Multiple faces detected ({state['multi_face_streak']}/{MAX_CONSECUTIVE_MULTI_FACE})"
                    current_cheat_percentage = CHEAT_THRESH
                    current_global_cheat_flag = 1
                    print(f"[Proctoring User {user_id}] VIOLATION: Multiple Faces ({state['multi_face_streak']}x)! Cheat percentage forced to {current_cheat_percentage:.2f}")

            else: # Exactly one face, proceed with head pose and combined logic
                state['no_face_streak'] = 0 # Reset streaks
                state['multi_face_streak'] = 0

                # --- Update Head Pose Violation Streak ---
                head_pose_violation_this_frame = (yaw_violation_flag == 1 or pitch_violation_flag == 1)

                if head_pose_violation_this_frame:
                    state['head_pose_violation_streak'] = min(current_head_pose_streak + 1, MAX_HEAD_POSE_STREAK_PENALTY)
                    print(f"[Proctoring User {user_id}] Head Pose Violation Streak: {state['head_pose_violation_streak']}")
                else:
                    # Reset streak if head is forward/ok UNLESS it just hit the global threshold,
                    # in which case the global threshold reset logic below will handle it.
                    # This avoids double-resetting or premature resetting.
                    if not (current_cheat_percentage > CHEAT_THRESH): # If score is not already over threshold
                         state['head_pose_violation_streak'] = 0
                # --- End Update Head Pose Violation Streak ---

                # --- Core 'process()' logic from detection.py ---
                # Calculate 'current' value for the 'avg' function based on violation flags
                current_val_for_avg = 0.0
                if current_global_cheat_flag == 0:
                    if yaw_violation_flag == 0:
                        if pitch_violation_flag == 0:
                            if audio_cheat_flag == 0:
                                current_val_for_avg = 0
                            else: # audio_cheat_flag == 1
                                current_val_for_avg = 0.2
                        else: # pitch_violation_flag == 1
                            if audio_cheat_flag == 0:
                                current_val_for_avg = 0.2
                            else: # audio_cheat_flag == 1
                                current_val_for_avg = 0.4
                    else: # yaw_violation_flag == 1
                        if pitch_violation_flag == 0:
                            if audio_cheat_flag == 0:
                                current_val_for_avg = 0.1
                            else: # audio_cheat_flag == 1
                                current_val_for_avg = 0.4
                        else: # pitch_violation_flag == 1
                            if audio_cheat_flag == 0:
                                current_val_for_avg = 0.15
                            else: # audio_cheat_flag == 1
                                current_val_for_avg = 0.25
                else: # current_global_cheat_flag == 1
                    if yaw_violation_flag == 0:
                        if pitch_violation_flag == 0:
                            if audio_cheat_flag == 0:
                                current_val_for_avg = 0
                            else: # audio_cheat_flag == 1
                                current_val_for_avg = 0.55
                        else: # pitch_violation_flag == 1
                            if audio_cheat_flag == 0:
                                current_val_for_avg = 0.55
                            else: # audio_cheat_flag == 1
                                current_val_for_avg = 0.85
                    else: # yaw_violation_flag == 1
                        if pitch_violation_flag == 0:
                            if audio_cheat_flag == 0:
                                current_val_for_avg = 0.6
                            else: # audio_cheat_flag == 1
                                current_val_for_avg = 0.85
                        else: # pitch_violation_flag == 1
                            if audio_cheat_flag == 0:
                                current_val_for_avg = 0.5
                            else: # audio_cheat_flag == 1
                                current_val_for_avg = 0.85

                # --- Apply streak penalty to current_val_for_avg ---
                if state['head_pose_violation_streak'] > 0:
                    streak_penalty = state['head_pose_violation_streak'] * STREAK_PENALTY_INCREMENT
                    current_val_for_avg += streak_penalty
                    # Clamp current_val_for_avg to prevent excessively high inputs into 'avg'
                    current_val_for_avg = min(current_val_for_avg, 5.0) 
                    print(f"[Proctoring User {user_id}] Applied streak penalty: +{streak_penalty:.2f}. New current_val_for_avg: {current_val_for_avg:.2f}")
                # --- End Apply streak penalty ---

                # --- NEW: Determine if user is recovering from a flagged state ---
                # This applies if global_cheat_flag was 1 last frame AND current behavior is good (current_val_for_avg is 0)
                is_recovering_from_flagged = (current_global_cheat_flag == 1 and current_val_for_avg == 0)
                # --- END NEW ---

                # Update cheat percentage using the custom 'avg' function
                new_cheat_percentage = avg(current_val_for_avg, current_cheat_percentage, is_recovering_from_flagged) # Pass the new flag
                state['cheat_percentage'] = new_cheat_percentage # Store the calculated value (could be > CHEAT_THRESH)

                # Update global_cheat_flag based on new_cheat_percentage
                if new_cheat_percentage > CHEAT_THRESH:
                    state['global_cheat_flag'] = 1
                    cheating_detected = True
                    
                    # Reset head_pose_violation_streak when cheat_percentage hits threshold (as per previous request)
                    if state['head_pose_violation_streak'] > 0: 
                        print(f"[Proctoring User {user_id}] Head pose violation streak reset from {state['head_pose_violation_streak']} to 0 because cheat percentage hit threshold.")
                        state['head_pose_violation_streak'] = 0

                    # Build reason string based on specific violations if score is high
                    reason_parts = []
                    if yaw_violation_flag == 1:
                        reason_parts.append("turned away")
                    if pitch_violation_flag == 1: # Only looking down per current logic
                        reason_parts.append("looking down")
                    
                    if reason_parts:
                        reason = f"Head {' and '.join(reason_parts)} (Score: {new_cheat_percentage:.2f})"
                    else:
                        reason = f"Suspicious activity (Score: {new_cheat_percentage:.2f})" # Fallback
                    
                    print(f"[Proctoring User {user_id}] VIOLATION: '{reason}' (Current: {new_cheat_percentage:.2f}, Prev Global: {current_global_cheat_flag})")
                else:
                    state['global_cheat_flag'] = 0
                    cheating_detected = False
                    reason = "OK"
                
                # --- Cap the suspicion score if it has already passed the cheat threshold (for next frame's start) ---
                if state['cheat_percentage'] > CHEAT_THRESH:
                    print(f"[Proctoring User {user_id}] Capping cheat percentage for next frame from {state['cheat_percentage']:.2f} to {CHEAT_THRESH:.2f}")
                    state['cheat_percentage'] = CHEAT_THRESH
                # --- End Cap ---

                # Print current state after potential capping
                print(f"[Proctoring User {user_id}] Cheat percent: {state['cheat_percentage']:.2f}, Global Cheat: {state['global_cheat_flag']}")


            # Get the final score from the state to return (this will be the capped value if applicable)
            final_cheat_percentage = state.get('cheat_percentage', 0.0)
            
            # Package results for return
            return {
                "success": True,
                "message": "Analysis complete",
                "cheating_detected": cheating_detected,
                "reason": reason,
                "num_faces": num_faces,
                "head_pose_score": final_cheat_percentage, # Renamed but returned as this for compatibility
                "debug_yaw": head_yaw, # Include for easy frontend debugging
                "debug_pitch": head_pitch # Include for easy frontend debugging
            }

    except Exception as e:
        print(f"!!! UNEXPECTED ERROR during proctoring analysis for user {user_id}: {type(e).__name__} - {e} !!!")
        import traceback
        traceback.print_exc()
        return {"success": False, "message": "Internal server error during analysis", "cheating_detected": False, "reason": "Server Error", "num_faces": 0, "head_pose_score": 0.0}