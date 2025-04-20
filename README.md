# Setup and Installation

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
        
    *   Initialize the database (creates `instance/database.db` and adds default users/exams):
        ```bash
        flask init-db
        ```

3.  **Set up Frontend:**
    *   Navigate to the frontend directory from the project root:
        ```bash
        cd ../src
        # Or if you are still in backend: cd ../frontend
        ```
    *   Install Node.js dependencies:
        ```bash
        npm install
        npm install date-fns
        npm install papaparse
        npm install xlsx
        npm install chart.js react-chartjs-2
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
*   Use the default credentials or the sign-up page:
    *   **Admin:** `admin` / `admin123`
    *   **Student:** `student` / `student123` (or newly registered students)
