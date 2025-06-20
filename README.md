# Intellixam AI Exam Proctoring
## Preview
**Intellixam** is a new way of proctoring online exam by incorporating the use of Face Detection to monitor student behavior and enhance exam integrity. By leveraging advanced technologies such as MediaPipe for real-time face and head pose detection, and OpenCV for image processing, Intellixam can automatically identify suspicious activities—such as looking away from the screen, the presence of multiple faces, or absence from the camera—during an exam session.

## Features
The platform features:

**Secure Authentication**: Students and admins log in with JWT-secured credentials.

![image](https://github.com/user-attachments/assets/6e3241eb-f64f-4a24-a983-94be48f05ba5)


**Automated Proctoring**: AI-driven analysis of webcam feeds to detect potential cheating.

![Screenshot 2025-06-12 223641](https://github.com/user-attachments/assets/79b3ea66-20e1-4b17-b9a4-eb829018b735)
![Untitled (1920 x 1080 px)](https://github.com/user-attachments/assets/54b19cd1-0c6a-44cb-9983-c80aa06227b0)
![image](https://github.com/user-attachments/assets/f3e532d2-d5ee-4361-a26b-8e29d62a91bc)


**Exam Management**: Admins can create, import, and manage exams.

![image](https://github.com/user-attachments/assets/4f1f7815-4580-462d-921e-434c43e84018)

![image](https://github.com/user-attachments/assets/0b6f362a-f1d9-4bc0-a2b5-09b8a7f481d6)

**Class Management**: Admins can create, import, and manage class and user groups.
![image](https://github.com/user-attachments/assets/efae3fd5-89ad-4f19-9958-58473cf9274c)

**Admin Dashboard**: Admin can view students' violations that caused the exam to be cancelled.
![Screenshot 2025-06-12 224135](https://github.com/user-attachments/assets/2f8dadf5-38fc-413a-844d-05ade5d4645d)


**Student Dashboard**: Students can view upcoming exams, recent results, and their submission history.
![image](https://github.com/user-attachments/assets/32023d21-9220-41b9-aa4a-5cb587849033)
![image](https://github.com/user-attachments/assets/8c9891db-d438-49e5-9e75-44655466be19)
![image](https://github.com/user-attachments/assets/6b6ddac2-1d06-4f45-a28a-6abf64a8257f)



## Use Case Diagram
![Intellixam Use Case Diagram](https://github.com/user-attachments/assets/e58c2a06-f678-433c-a858-1d900aa41ea8)

## Entity Relationship Diagram
![erd diagram intellixam](https://github.com/user-attachments/assets/ac19cde2-bf3a-4263-93b4-adb1ad7c4dd6)

## Tech Stack
![Screenshot 2025-06-12 222121](https://github.com/user-attachments/assets/0b7df924-edeb-42d3-87a6-6525027ed14f)



## Setup and Installation

Follow these steps to set up and run the project locally.

**Prerequisites:**

*   **Python:** Version **3.11** or **3.12** is required due to MediaPipe compatibility. Python 3.13 is **not** currently supported by the necessary version of MediaPipe. Make sure Python and `pip` are added to your system's PATH.
*   **Node.js:** Latest LTS version recommended. Download from [nodejs.org](https://nodejs.org/). Comes bundled with `npm`.

**Steps:**

1.  **Clone the Repository:**
    ```bash
    git clone <your-repository-url>
    cd my-exam-app
    ```
2.  **Set up Backend:**
    *   Navigate to the backend directory:
        ```bash
        cd backend
        ```
    *   Create a Python virtual environment (**Python 3.11 or 3.12 !!!**) executable:
        ```bash
        # Example for Python 3.11 (replace with your actual command/path if needed):
        python3.11 -m venv venv
        # Or on Windows might be: py -3.11 -m venv venv
        ```
    *   Activate the virtual environment:
        *   Windows: `.\venv\Scripts\activate`
        *   macOS/Linux: `source venv/bin/activate`

    *   Install required Python packages:
        ```bash
        pip install -r requirements.txt
        ```
        

3.  **Set up Frontend:**
    *   Install Node.js dependencies:
        ```bash
        npm install
        ```

# Running the Application

You need **two separate terminals** open to run both the backend and frontend concurrently.

1.  **Terminal 1: Start Backend Server**
    *   Navigate to the `backend` directory.
    *   Activate the virtual environment (`venv\Scripts\activate` or `source venv/bin/activate`).
    *   Run the application using the SocketIO server:
        ```bash
        python app.py
        ```
    *   Keep this terminal running. The backend API and WebSocket server will be accessible (usually at `http://localhost:5000`).

2.  **Terminal 2: Start Frontend Server**
    *   Navigate to the `frontend` directory.
    *   Run the React development server:
        ```bash
        npm start
        ```
    *   This should automatically open the application in your browser at `http://localhost:3000`.

**Accessing the Application:**

*   Open `http://localhost:3000` in your web browser.
*   Create new account on the sign-up page:
