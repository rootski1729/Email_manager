"""Showing an email's HTML safely: nothing active survives, quoted history goes, images are handled."""

from email.message import EmailMessage

from app.providers.html_view import safe_email_html


def raw(html: str, *, text: str = "plain", inline: bytes | None = None) -> bytes:
    m = EmailMessage()
    m["From"], m["To"], m["Subject"] = "a@x.com", "b@y.com", "Hi"
    m.set_content(text)
    m.add_alternative(html, subtype="html")
    if inline:
        m.get_payload()[1].add_related(inline, maintype="image", subtype="png", cid="<logo@x>")
    return bytes(m)


ATTACK = """<html><head><style>body{display:none}</style><script>alert(1)</script></head><body>
<p onclick="steal()" style="color:#333;position:fixed;top:0">Hello <b>there</b></p>
<a href="javascript:alert(1)">bad</a> <a href="https://github.com/x">good</a> <a href="mailto:a@b.c">mail</a>
<iframe src="https://evil.example"></iframe><form action="https://evil.example"><input name="pw"></form>
<img src="https://tracker.example/pixel.gif" onerror="x()" width="1"><svg><script>x()</script></svg>
<object data="x.swf"></object><meta http-equiv="refresh" content="0;url=https://evil.example">
</body></html>"""


def test_nothing_active_survives() -> None:
    safe = safe_email_html(raw(ATTACK), drop_quotes=False)
    assert safe is not None
    html = safe.html.lower()
    for bad in ("<script", "onclick", "onerror", "javascript:", "<iframe", "<form", "<input", "<svg", "<object",
                "<meta", "<style", "position:", "display:none"):
        assert bad not in html, bad
    assert "<b>there</b>" in safe.html and "color:#333" in safe.html.replace(" ", "")
    assert 'href="https://github.com/x"' in safe.html and 'rel="noopener noreferrer nofollow"' in safe.html
    assert 'href="mailto:a@b.c"' in safe.html


def test_remote_images_are_held_back_and_inline_images_embedded() -> None:
    safe = safe_email_html(raw('<p>Hi<img src="cid:logo@x"><img src="https://cdn.example/a.png" alt="A"></p>',
                               inline=b"\x89PNG fake"), drop_quotes=False)
    assert safe is not None and safe.remote_images == 1
    assert 'data-ms-src="https://cdn.example/a.png"' in safe.html and ' src="https://cdn' not in safe.html
    assert 'src="data:image/png;base64,' in safe.html


def test_quoted_history_is_dropped_from_replies() -> None:
    gmail = ('<div dir="ltr">Thanks, Friday works.</div><br><div class="gmail_quote"><div>On Tue, Asha wrote:'
             '</div><blockquote class="gmail_quote">Old message</blockquote></div>')
    reply = safe_email_html(raw(gmail), drop_quotes=True)
    assert reply is not None and "Friday works" in reply.html and "Old message" not in reply.html
    whole = safe_email_html(raw(gmail), drop_quotes=False)
    assert whole is not None and "Old message" in whole.html  # forwards and new mail keep everything

    outlook = ('<div>Slot confirmed.</div><div id="appendonsend"></div><hr><div><b>From:</b> Asha</div>'
               '<div>Old request</div>')
    trimmed = safe_email_html(raw(outlook), drop_quotes=True)
    assert trimmed is not None and "Slot confirmed" in trimmed.html and "Old request" not in trimmed.html


def test_github_style_markdown_html_keeps_its_formatting() -> None:
    github = ('<p><strong>Correction to my review</strong></p><p>Logs <code>response={"token": ...}</code> in '
              '<code>_body_for_log</code>.</p><ul><li>mask <code>token</code></li><li>mask <code>password</code></li>'
              '</ul><p><a href="https://github.com/o/r/pull/518#c1">View it on GitHub</a></p>')
    safe = safe_email_html(raw(github, text="**Correction to my review**"), drop_quotes=False)
    assert safe is not None
    assert "<strong>Correction to my review</strong>" in safe.html and "<code>_body_for_log</code>" in safe.html
    assert "<li>mask <code>token</code></li>" in safe.html and "View it on GitHub</a>" in safe.html


def test_no_html_part_or_empty_html_falls_back_to_text() -> None:
    m = EmailMessage()
    m["From"], m["To"], m["Subject"] = "a@x.com", "b@y.com", "Hi"
    m.set_content("only text")
    assert safe_email_html(bytes(m), drop_quotes=False) is None
    assert safe_email_html(raw("<html><body><script>x()</script></body></html>"), drop_quotes=False) is None
