import os
import tempfile
import unittest
from pathlib import Path


_test_directory = tempfile.TemporaryDirectory()
os.environ["ADMIN_TOKEN"] = "test-admin-token"
os.environ["SESSION_SECRET"] = "test-session-secret"
os.environ["DATABASE_URL"] = f"sqlite:///{(Path(_test_directory.name) / 'test.db').as_posix()}"

from fastapi.testclient import TestClient

from main import app, engine


class ChatApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        cls.client.close()
        engine.dispose()
        _test_directory.cleanup()

    def test_login_room_password_and_messages(self):
        response = self.client.post("/api/login", json={"login": "tester"})
        self.assertEqual(response.status_code, 200, response.text)

        response = self.client.post(
            "/api/admin/rooms",
            headers={"X-Admin-Token": "test-admin-token"},
            json={"name": "Test room", "description": "API test", "password": "secret"},
        )
        self.assertEqual(response.status_code, 201, response.text)
        room_id = response.json()["id"]

        response = self.client.post(f"/api/rooms/{room_id}/join", json={"password": "wrong"})
        self.assertEqual(response.status_code, 403)

        response = self.client.post(f"/api/rooms/{room_id}/join", json={"password": "secret"})
        self.assertEqual(response.status_code, 200, response.text)
        room_token = response.json()["room_token"]
        headers = {"X-Room-Token": room_token}

        response = self.client.post(
            f"/api/rooms/{room_id}/messages",
            headers=headers,
            data={"content": "Hello from test"},
        )
        self.assertEqual(response.status_code, 201, response.text)

        response = self.client.get(f"/api/rooms/{room_id}/messages", headers=headers)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()[0]["content"], "Hello from test")

    def test_russian_login_and_room_name(self):
        response = self.client.post("/api/login", json={"login": "Иван"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["login"], "иван")

        response = self.client.post(
            "/api/admin/rooms",
            headers={"X-Admin-Token": "test-admin-token"},
            json={"name": "Книжный клуб", "description": "Обсуждаем книги"},
        )
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()["name"], "Книжный клуб")


if __name__ == "__main__":
    unittest.main()
