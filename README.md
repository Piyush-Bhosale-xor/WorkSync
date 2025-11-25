# WorkSync

WorkSync is a full-featured **project management web application** built with **Django**, **MySQL**, **HTML**, **CSS**, and **JavaScript**.  
It allows teams and individuals to organize projects, assign tasks, track progress, and collaborate efficiently — all within a clean and responsive interface.

---

##  Features

-  User authentication (Register / Login / Roles)
-  Create and manage multiple projects
-  Task assignment with priority levels and ETA
-  Deadlines and progress tracking
-  Project dashboard view
-  Comment / activity support (optional)
-  Notification capability (extendable)
-  Fully responsive UI

---

##  Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | DjangoRestFramework (Python) |
| Database | MySQL |
| Frontend | HTML, CSS, JavaScript |
| Authentication | Django JWTAuth |

---

##  Installation & Setup
py -m venv myenv

myenv\Scripts\activate

pip install requirements.txt

python manage.py makemigrations

python manage.py migrate

python manage.py runserver

// in bash

python -m http.server 5500

// redirect to following link in browser

http://127.0.0.1:5500/Frontend/login.html

### 1️⃣ Clone the Repository

```sh
git clone https://github.com/Piyush-Bhosale-xor/WorkSync.git
cd Kanban
