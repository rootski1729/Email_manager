"""Stand-in for the Azure OpenAI chat-completions API, for the local preview only.

Answers each MailSentinel prompt type with plausible JSON after a short delay, so loading states show.
Run: python mock_ai.py  (listens on 127.0.0.1:9911; the preview's AI endpoint is http://127.0.0.1:9911/v1)
MOCK_AI_BURST=1 sends each streamed answer in one burst after a pause, the way Azure's content filter does.
"""

import json
import os
import re
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


STOP = {"the", "a", "an", "email", "emails", "mail", "find", "me", "my", "where", "and", "i", "we", "about", "with",
        "from", "that", "which", "had", "have", "discussed", "discussion", "show", "can", "you", "please", "of", "on"}


def tool_step(messages: list[dict]) -> dict:
    """Tool-using conversation (the mail assistant): search, then answer; open or draft when asked."""
    last = messages[-1]
    if last["role"] == "tool":
        data = json.loads(last["content"])
        if "results" in data:
            n = data["found"]
            if not n:
                return {"content": "I couldn't find that. Do you remember **who** sent it or **roughly when**?"}
            return {"content": f"I found **{n}** email{'s' if n != 1 else ''} that match. Is it one of these? "
                               "Tell me the number, or more about it."}
        if data.get("draft_ready"):
            return {"content": "Here's a draft. Check it and press **Send** when you're happy."}
        if data.get("opened"):
            return {"content": f"Opened it for you (code **{data.get('code')}**)."}
        if "text" in data:
            return {"content": f"It's from **{data['from']}**: {data['text'][:160]}…"}
        return {"content": data.get("error") or "Done."}
    text = last["content"].lower()
    def call(name: str, args: dict) -> dict:
        return {"tool_calls": [{"id": "t1", "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}]}
    if "reply" in text:
        return call("draft_reply", {"n": 1, "instructions": last["content"]})
    if text.strip().startswith(("open", "show")):
        return call("open_email", {"n": 1})
    if "what" in text and "say" in text:
        return call("read_email", {"n": 1})
    words = [w for w in re.findall(r"[a-z0-9]+", text) if w not in STOP]
    sender = ""
    if m := re.search(r"\b(?:with|from|by) ([a-z]+)", text):
        sender = m.group(1)
        words = [w for w in words if w != sender]
    return call("search_mail", {"sender": sender, "words": words[:2]})


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
        return {"answer": ("Your technical round moved to **Friday 10 Oct, 3:00 PM IST** on Microsoft Teams.\n\n"
                           "- The meeting link comes in a separate invite\n- Keep your **college ID** handy\n"
                           "- Reply to Riya if the time doesn't work")}
    if "Answer the user's question" in system:
        ref = (re.search(r"#(\w+) \|", last) or [None, ""])[1]
        return {"answer": f"Your interview is on **Fri 10 Oct, 3:00 PM IST** on Teams (#{ref})."}
    return {"answer": "ok"}


class Handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if body.get("tools"):  # the mail assistant: tool calls instead of JSON
            message = tool_step(body["messages"])
            time.sleep(0.7)
            data = json.dumps({"choices": [{"message": {"role": "assistant", **message}}]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        result = answer(body["messages"])
        # JSON mode gets the object; plain-text requests (questions) get the Markdown answer itself.
        content = json.dumps(result) if body.get("response_format") else result.get("answer", "")
        if body.get("stream"):
            time.sleep(0.6)
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()
            # MOCK_AI_BURST=1 imitates Azure's content filter: a pause, then the whole answer in one go.
            pieces = [content] if os.environ.get("MOCK_AI_BURST") == "1" else re.findall(r"\S+\s*", content)
            if len(pieces) == 1:
                time.sleep(1.5)
            for word in pieces:  # otherwise a word at a time, like a real model
                chunk = {"choices": [{"delta": {"content": word}}]}
                self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode())
                self.wfile.flush()
                time.sleep(0.06)
            self.wfile.write(b"data: [DONE]\n\n")
            return
        time.sleep(0.8)
        data = json.dumps({"choices": [{"message": {"content": content}}]}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args: object) -> None:
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 9911), Handler).serve_forever()
