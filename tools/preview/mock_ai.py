"""Stand-in for the Azure OpenAI chat-completions API, for the local preview only.

Answers each MailSentinel prompt type with plausible JSON after a short delay, so loading states show.
Run: python mock_ai.py  (listens on 127.0.0.1:9911; the preview's AI endpoint is http://127.0.0.1:9911/v1)
"""

import json
import re
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def answer(messages: list[dict]) -> dict:
    system, last = messages[0]["content"], messages[-1]["content"]
    email = next((m["content"] for m in messages[1:] if "<email>" in m["content"]), "")
    subject = (re.search(r"Subject: (.*)", email) or [None, "your email"])[1]
    if "summarise one email" in system:
        return {"summary": f"About “{subject}”: the key facts are in the email.", "action": "Reply if needed.",
                "importance": "normal"}
    if "Suggest exactly 3" in system:
        if steer := re.search(r"follow this: (.*?)\. All 3", system):
            w = steer.group(1)
            return {"replies": [{"label": w.capitalize()[:28], "instruction": f"Reply that does this: {w}."},
                                {"label": "Short and kind", "instruction": f"A short, kind reply that does this: {w}."},
                                {"label": "With a reason", "instruction": f"Do this ({w}) and give a brief reason."}]}
        return {"replies": [{"label": "Confirm", "instruction": "Thank them and confirm."},
                            {"label": "Ask a question", "instruction": "Ask one clarifying question."},
                            {"label": "Ask to reschedule", "instruction": "Politely ask for another time."}]}
    if "Write an email reply" in system:
        if "Change the draft like this" in last:
            change = last.split(":", 1)[1].strip()
            return {"subject": f"Re: {subject}",
                    "body": f"Dear Sir/Madam,\n\nThank you for your email. (Changed: {change}.)\n\nBest regards,\nAsha"}
        wanted = re.search(r"Instructions from the reader: (.*)", last)
        what = (wanted.group(1) if wanted else last).strip().rstrip(".")
        return {"subject": f"Re: {subject}",
                "body": f"Dear Sir/Madam,\n\nThank you for your email. {what[:1].upper() + what[1:]}.\n\nBest regards,\nAsha"}
    if "Write a new email" in system:
        to = re.findall(r"[\w.+-]+@[\w-]+\.[\w.]+", last)
        return {"to": to[:1], "cc": [], "subject": "Request", "body": f"Dear Sir/Madam,\n\n{last}\n\nBest regards,\nAsha"}
    if "into a rule" in system:
        return {"name": "College mail", "explanation": "Emails from akgec.ac.in",
                "condition": {"field": "from.domain", "op": "domain_matches", "value": ["akgec.ac.in"]}}
    if "understand one email" in system:
        return {"answer": f"From “{subject}”:\n- {last.strip().rstrip('?')}: see the email text\n- Nothing else is needed."}
    if "Answer the user's question" in system:
        ref = (re.search(r"#(\w+) \|", last) or [None, ""])[1]
        return {"answer": "Your next important date is in this email.", "refs": [ref] if ref else []}
    return {"answer": "ok"}


class Handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        time.sleep(0.8)
        data = json.dumps({"choices": [{"message": {"content": json.dumps(answer(body["messages"]))}}]}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args: object) -> None:
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 9911), Handler).serve_forever()
