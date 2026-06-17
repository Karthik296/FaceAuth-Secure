import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
import os
import json
import sqlite3

# Set up environment variables/paths before importing main
import database

# Use a separate test database file to avoid dirtying the production database
TEST_DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_database.db")
database.DB_PATH = TEST_DB_PATH

from main import app

class TestFaceAuthAPI(unittest.TestCase):
    
    @classmethod
    def setUpClass(cls):
        # Force database reset for tests
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)
        database.init_db()
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        # Clean up test database file
        if os.path.exists(TEST_DB_PATH):
            try:
                os.remove(TEST_DB_PATH)
            except Exception as e:
                print(f"Error removing test db: {e}")

    def setUp(self):
        # Clear database records between tests
        conn = sqlite3.connect(TEST_DB_PATH)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM users")
        conn.commit()
        conn.close()

    @patch('face_engine.decode_base64_image')
    @patch('face_engine.extract_face_embedding')
    def test_registration_success(self, mock_extract, mock_decode):
        # Arrange
        mock_decode.return_value = "dummy_image_matrix"
        # Return a dummy 128d embedding
        mock_extract.return_value = ([0.1] * 128, None)
        
        payload = {
            "first_name": "Karthik",
            "last_name": "Reddy",
            "email": "karthik@example.com",
            "password": "mypassword",
            "image": "data:image/jpeg;base64,dummybase64"
        }
        
        # Act
        response = self.client.post("/api/register", json=payload)
        
        # Assert
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "success")
        self.assertTrue(database.email_exists("karthik@example.com"))

    @patch('face_engine.decode_base64_image')
    @patch('face_engine.extract_face_embedding')
    def test_registration_duplicate_email(self, mock_extract, mock_decode):
        # Arrange
        mock_decode.return_value = "dummy_image_matrix"
        mock_extract.return_value = ([0.1] * 128, None)
        
        payload = {
            "first_name": "Karthik",
            "last_name": "Reddy",
            "email": "karthik@example.com",
            "password": "mypassword",
            "image": "data:image/jpeg;base64,dummybase64"
        }
        
        # Register once
        self.client.post("/api/register", json=payload)
        
        # Act: Register again with same email
        response = self.client.post("/api/register", json=payload)
        
        # Assert
        self.assertEqual(response.status_code, 400)
        self.assertIn("exists", response.json()["detail"])

    @patch('face_engine.decode_base64_image')
    @patch('face_engine.extract_face_embedding')
    def test_registration_no_face_detected(self, mock_extract, mock_decode):
        # Arrange
        mock_decode.return_value = "dummy_image_matrix"
        # Face extraction fails (returns None and an error message)
        mock_extract.return_value = (None, "No face detected in the frame.")
        
        payload = {
            "first_name": "Karthik",
            "last_name": "Reddy",
            "email": "karthik@example.com",
            "password": "mypassword",
            "image": "data:image/jpeg;base64,dummybase64"
        }
        
        # Act
        response = self.client.post("/api/register", json=payload)
        
        # Assert
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "No face detected in the frame.")

    @patch('face_engine.decode_base64_image')
    @patch('face_engine.extract_face_embedding')
    def test_registration_duplicate_face(self, mock_extract, mock_decode):
        # Arrange
        mock_decode.return_value = "dummy_image_matrix"
        
        # 1. Register User A with a specific embedding
        user_a_emb = [0.5] * 128
        mock_extract.return_value = (user_a_emb, None)
        self.client.post("/api/register", json={
            "first_name": "User",
            "last_name": "Alpha",
            "email": "alpha@example.com",
            "password": "mypassword",
            "image": "dummy"
        })
        
        # 2. Try to register User B with the SAME face embedding but different email
        mock_extract.return_value = (user_a_emb, None)
        payload = {
            "first_name": "User",
            "last_name": "Beta",
            "email": "beta@example.com",
            "password": "mypassword",
            "image": "dummy"
        }
        
        # Act
        response = self.client.post("/api/register", json=payload)
        
        # Assert
        self.assertEqual(response.status_code, 400)
        self.assertIn("already registered", response.json()["detail"])

    @patch('face_engine.decode_base64_image')
    @patch('face_engine.extract_face_embedding')
    def test_login_success(self, mock_extract, mock_decode):
        # Arrange
        mock_decode.return_value = "dummy_image_matrix"
        
        # 1. Register User A with a specific embedding
        user_a_emb = [0.5] * 128
        mock_extract.return_value = (user_a_emb, None)
        self.client.post("/api/register", json={
            "first_name": "User",
            "last_name": "Alpha",
            "email": "alpha@example.com",
            "password": "mypassword",
            "image": "dummy"
        })
        
        # 2. Mock login scan to return an embedding identical to User A
        mock_extract.return_value = (user_a_emb, None)
        
        # Act
        response = self.client.post("/api/login", json={"image": "dummy_login_scan"})
        
        # Assert
        self.assertEqual(response.status_code, 200)
        res_json = response.json()
        self.assertEqual(res_json["status"], "success")
        self.assertEqual(res_json["user"]["email"], "alpha@example.com")
        self.assertGreaterEqual(res_json["similarity_score"], 0.99)

    @patch('face_engine.decode_base64_image')
    @patch('face_engine.extract_face_embedding')
    def test_login_face_does_not_match(self, mock_extract, mock_decode):
        # Arrange
        mock_decode.return_value = "dummy_image_matrix"
        
        # 1. Register User Alpha with positive embedding
        mock_extract.return_value = ([0.5] * 128, None)
        self.client.post("/api/register", json={
            "first_name": "User",
            "last_name": "Alpha",
            "email": "alpha@example.com",
            "password": "mypassword",
            "image": "dummy"
        })
        
        # 2. Mock login scan to return a completely opposite embedding (negative similarity)
        mock_extract.return_value = ([-0.5] * 128, None)
        
        # Act
        response = self.client.post("/api/login", json={"image": "dummy_login_scan"})
        
        # Assert
        self.assertEqual(response.status_code, 401)
        self.assertIn("match", response.json()["detail"])

    @patch('face_engine.decode_base64_image')
    @patch('face_engine.extract_face_embedding')
    def test_verify_face_success(self, mock_extract, mock_decode):
        # Arrange
        mock_decode.return_value = "dummy_image_matrix"
        mock_extract.return_value = ([0.1] * 128, None)
        
        # Act: Verify a face when DB is empty
        response = self.client.post("/api/verify-face", json={"image": "dummy"})
        
        # Assert
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "success")

    @patch('face_engine.decode_base64_image')
    @patch('face_engine.extract_face_embedding')
    def test_verify_face_already_registered(self, mock_extract, mock_decode):
        # Arrange
        mock_decode.return_value = "dummy_image_matrix"
        user_emb = [0.5] * 128
        mock_extract.return_value = (user_emb, None)
        
        # Register a user first
        self.client.post("/api/register", json={
            "first_name": "User",
            "last_name": "Alpha",
            "email": "alpha@example.com",
            "password": "mypassword",
            "image": "dummy"
        })
        
        # Mock extract again to return the same embedding
        mock_extract.return_value = (user_emb, None)
        
        # Act: Verify the same face
        response = self.client.post("/api/verify-face", json={"image": "dummy"})
        
        # Assert
        self.assertEqual(response.status_code, 400)
        self.assertIn("already registered", response.json()["detail"])

    @patch('face_engine.decode_base64_image')
    @patch('face_engine.extract_face_embedding')
    def test_verify_face_no_face_detected(self, mock_extract, mock_decode):
        # Arrange
        mock_decode.return_value = "dummy_image_matrix"
        mock_extract.return_value = (None, "No face detected in the frame.")
        
        # Act
        response = self.client.post("/api/verify-face", json={"image": "dummy"})
        
        # Assert
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "No face detected in the frame.")

    @patch('face_engine.decode_base64_image')
    @patch('face_engine.extract_face_embedding')
    def test_password_login_success(self, mock_extract, mock_decode):
        # Arrange
        mock_decode.return_value = "dummy_image_matrix"
        mock_extract.return_value = ([0.1] * 128, None)
        
        # Register User
        self.client.post("/api/register", json={
            "first_name": "Karthik",
            "last_name": "Reddy",
            "email": "karthik@example.com",
            "password": "mypassword",
            "image": "dummy"
        })
        
        # Act
        payload = {
            "email": "karthik@example.com",
            "password": "mypassword"
        }
        response = self.client.post("/api/login-password", json=payload)
        
        # Assert
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "success")
        self.assertEqual(response.json()["user"]["email"], "karthik@example.com")

    def test_password_login_invalid_credentials(self):
        # Act
        payload = {
            "email": "unknown@example.com",
            "password": "wrongpassword"
        }
        response = self.client.post("/api/login-password", json=payload)
        
        # Assert
        self.assertEqual(response.status_code, 401)

if __name__ == "__main__":
    unittest.main()
