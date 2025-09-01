AI-Powered X-Ray Analysis Prototype
An end-to-end web application that uses a custom-trained AI model to classify X-ray images of the foot and generate a detailed report.

1. Project Overview & Features
This project demonstrates a full-stack, AI-driven application designed to assist in the preliminary assessment of foot health. The application's core function is to classify X-ray images as "Normal" or "Abnormal" and provide a structured, human-readable report.

Key Features:

Custom AI Classification: A deep learning model, trained on a real dataset, classifies X-ray images.

Automated Report Generation: The Gemini API is used to create a detailed, professional-sounding report based on the AI's classification.

Measurement Simulation: The application simulates key clinical measurements, such as the Navicular Index (>9.96 for abnormal) and Calcaneal Spur (>2mm for abnormal), based on the AI's output.

User History: All analysis reports are saved to a private, user-specific history in Firebase Firestore.

Modern & Responsive UI: Built with React and Tailwind CSS for a clean, professional user experience.

2. AI Model & Results
The AI model is a Convolutional Neural Network (CNN) built with TensorFlow/Keras and uses transfer learning with a pre-trained VGG16 model. This approach allows for a high level of accuracy despite the limited size of the training dataset.

Training Details:

Dataset: [Number] X-ray images of the foot, classified into Normal and Abnormal categories.

Architecture: VGG16 (pre-trained on ImageNet) with a custom classification layer.

Model Performance:

The model achieved an accuracy of approximately 65.31% on the validation data. The classification report below highlights its performance on both classes.

Classification Report:
              precision    recall  f1-score   support

      Normal       0.60      0.32      0.41        19
    Abnormal       0.67      0.87      0.75        30

    accuracy                           0.65        49
   macro avg       0.63      0.59      0.58        49
weighted avg       0.64      0.65      0.62        49

Recall for Abnormal (0.87): The model is very good at correctly identifying 87% of the actual abnormal cases.

Recall for Normal (0.32): The model struggles to correctly identify normal cases, misclassifying them as abnormal. This is a common challenge with small datasets and a bias that would be addressed in future development.

3. Project Architecture
The project is built as a full-stack application with distinct, interconnected components.

Frontend (React App): Sends the uploaded image to the backend and displays the final report.

Backend (Python Flask): The central hub that loads the AI model, performs classification, and uses a prompt for the Gemini API to generate a report.

Cloud Services: Firebase handles user authentication and database storage. Gemini provides the generative AI for report creation.

4. Getting Started
To run this project locally, follow these steps.

Prerequisites
Python 3.8+ & pip

Node.js & npm

Git

Setup
Clone the repositories:

git clone https://github.com/Harshagit01/xray-analyzer-frontend.git
git clone https://github.com/Harshagit01/xray-analyzer-backend.git

Backend Setup:

cd xray-analyzer-backend
pip install -r requirements.txt # (assuming you have a requirements file)
python app.py

Frontend Setup:

cd xray-analyzer-frontend
npm install
npm start

5. Future Improvements
AI Model Accuracy: Implement more advanced techniques like transfer learning and acquire a larger, more diverse dataset for improved accuracy.

Keypoint Detection: Train a new AI model to detect key anatomical points on the X-ray to perform real, not simulated, clinical measurements.

Full User Management: Add full user registration and login functionality./create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
