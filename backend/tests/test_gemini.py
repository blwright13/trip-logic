from __future__ import annotations

import unittest

import httpx

from app.gemini import _parse_error_response


class GeminiErrorParsingTests(unittest.TestCase):
    def test_parse_rate_limit_error_includes_status_and_retry_after(self) -> None:
        response = httpx.Response(
            429,
            json={
                "error": {
                    "message": "You exceeded your current quota.\nPlease retry in 26.2s.",
                    "details": [
                        {
                            "@type": "type.googleapis.com/google.rpc.RetryInfo",
                            "retryDelay": "26s",
                        }
                    ],
                }
            },
        )

        error = _parse_error_response(response)

        self.assertEqual(error.status_code, 429)
        self.assertEqual(error.retry_after, 26)
        self.assertIn("rate limit exceeded", str(error).lower())
        self.assertIn("You exceeded your current quota.", str(error))


if __name__ == "__main__":
    unittest.main()
