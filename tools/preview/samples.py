"""Realistic sample emails for the local preview: a Gmail reply thread, an Outlook reply, a forward, an HTML
newsletter and a long email with attachments. Names and addresses are made up."""

from email.message import EmailMessage


def _msg(frm: str, subject: str, text: str, *, html: str | None = None, headers: dict | None = None,
         files: tuple = ()) -> bytes:
    m = EmailMessage()
    m["From"], m["To"], m["Subject"] = frm, "asha@gmail.com", subject
    m["Date"] = "Wed, 07 Oct 2026 10:15:00 +0530"
    for k, v in (headers or {}).items():
        m[k] = v
    m.set_content(text)
    if html:
        m.add_alternative(html, subtype="html")
    for name, ctype, data in files:
        main, sub = ctype.split("/")
        m.add_attachment(data, maintype=main, subtype=sub, filename=name)
    return bytes(m)


SAMPLES = {
    "gmail_reply": _msg("Riya Sharma <riya@infosys.com>", "Re: Interview schedule: Software Engineer", """Hi Asha,

Thanks for confirming. We've moved your technical round to Friday 10 October at 3:00 PM IST on Microsoft Teams.
The link will come in a separate calendar invite. Please keep your college ID handy.

Let me know if this time doesn't work.

Best regards,
Riya Sharma
Talent Acquisition | Infosys

On Tue, 6 Oct 2026 at 18:02, Asha Verma <asha@gmail.com> wrote:
> Hi Riya,
> Thursday works for me. Could you share the meeting link?
> Thanks,
> Asha
>
> On Tue, 6 Oct 2026 at 11:40, Riya Sharma <riya@infosys.com> wrote:
>> Dear Asha, we'd like to invite you to a technical interview on Thursday.
""", headers={"In-Reply-To": "<abc@gmail.com>"}),
    "outlook_reply": _msg("Prof. R. Mehta <mehta@akgec.ac.in>", "RE: Project viva slots", """Dear Asha,

Your slot is confirmed for 20 October, 11:30 AM in Lab 3. Please bring two printed copies of the report.

Regards
Dr. R. Mehta

________________________________
From: Asha Verma <asha@gmail.com>
Sent: Monday, October 5, 2026 9:12 PM
To: Prof. R. Mehta <mehta@akgec.ac.in>
Subject: Project viva slots

Respected Sir, may I take the 11:30 slot on 20 October?
""", headers={"In-Reply-To": "<xyz@akgec.ac.in>"}),
    "forward": _msg("Dad <papa@gmail.com>", "Fwd: Electricity bill October", """See this, pay before due date.

---------- Forwarded message ---------
From: UPPCL Billing <noreply@uppcl.org>
Date: Mon, Oct 5, 2026 at 9:00 AM
Subject: Electricity bill October
To: <papa@gmail.com>

Dear Consumer,
Your electricity bill of Rs 2,340 for account 1234567 is generated. Due date: 15 October 2026.
Pay online at https://uppcl.org/pay
"""),
    "newsletter": _msg("Coursera <no-reply@coursera.org>", "Your certificate is ready!", "Your certificate is ready.",
                       html="<h1>Congratulations, Asha!</h1><p>You've completed <b>Machine Learning</b>.</p>"
                            "<p><a href='https://coursera.org/cert'>View certificate</a></p>"
                            "<p>Share it on LinkedIn to show your achievement.</p>"),
    "long_with_files": _msg("Exam Cell <exams@akgec.ac.in>", "End-semester examination schedule and instructions",
        "Dear Students,\n\n" + "\n\n".join(f"{i}. {s}" for i, s in enumerate([
            "The end-semester examinations will begin on 15 October 2026 at 10:00 AM.",
            "Admit cards are available on the student portal and must be downloaded before 12 October.",
            "Students must reach the examination hall 30 minutes before the start time.",
            "Mobile phones, smart watches and calculators with memory are not allowed.",
            "The detailed date sheet is attached with this email."], 1))
        + "\n\nRegards,\nController of Examinations",
        files=(("Date_Sheet_Odd_Sem_2026.pdf", "application/pdf", b"%PDF-1.7 " + b"x" * 180_000),
               ("Exam_Instructions.docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document", b"PK" + b"y" * 40_000))),
}
