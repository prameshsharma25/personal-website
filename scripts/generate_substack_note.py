"""
Substack Notes Agent
Fetches your latest Substack posts, generates a daily Note in your voice,
and emails it to you for review before manual posting.
"""

import os
import re
import random
import smtplib
import feedparser
from datetime import datetime, time
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from google import genai

try:
    from dotenv import load_dotenv

    load_dotenv(".env.local")
except ImportError:
    pass

SUBSTACK_URL = "https://prameshsharma.substack.com"
RSS_FEED_URL = f"{SUBSTACK_URL}/feed"
RECIPIENT_EMAIL = os.environ["RECIPIENT_EMAIL"]
SENDER_EMAIL = os.environ["SENDER_EMAIL"]
GMAIL_APP_PASSWORD = os.environ["GMAIL_APP_PASSWORD"]
GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]

MAX_POSTS_TO_FETCH = 10  # how many recent posts to pull for context
MAX_CHARS_PER_POST = 2000  # truncate long posts so we don't blow the context window


def fetch_posts(n: int = MAX_POSTS_TO_FETCH) -> list[dict]:
    feed = feedparser.parse(RSS_FEED_URL)
    posts = []
    for entry in feed.entries[:n]:
        raw = entry.get("summary", entry.get("content", [{}])[0].get("value", ""))
        clean = re.sub(r"<[^>]+>", "", raw).strip()
        posts.append(
            {
                "title": entry.get("title", "Untitled"),
                "url": entry.get("link", ""),
                "date": entry.get("published", ""),
                "content": clean[:MAX_CHARS_PER_POST],
            }
        )
    return posts


SYSTEM_PROMPT = """You are a ghostwriter for Pramesh Sharma, a Computational Biologist and Software Engineer at the NIH who writes about science, research, and career navigation for students and early-career scientists.

Pramesh's voice is:
- Warm, personal, and encouraging — like a brilliant older sibling in STEM
- Grounded in real lived experience: a rare genetic disease (Pyruvate Kinase Deficiency), internships at NASA and Genentech, and now NIH research
- Optimistic but never preachy; honest about the difficulty of the path
- Uses concrete, specific details rather than generic platitudes
- Ends with a quiet call to reflection or action, never a hard sell

A Substack Note is short-form, 150–280 words. It should:
1. Open with a hook — a mistake, a misconception, or something the reader has felt themselves. The first sentence should make the reader think "that's me" — not "wow, impressive."
2. Build to a single clear insight drawn from the source material
3. Close with something the reader can sit with or act on
4. Feel like it was written spontaneously, not manufactured

OPENINGS — bad vs good:
BAD: "I remember mapping out my career path with meticulous detail — NASA, then industry..."
GOOD: "Nobody told me the plan I made in college was mostly fiction."

BAD: "After my second Genentech internship, I realized..."
GOOD: "I spent two summers thinking I understood what scientists actually did. I was wrong."

BAD: "Working at the NIH taught me the value of persistence in research..."
GOOD: "There was a week where nothing worked. Every result pointed nowhere. I almost emailed my PI to say I was done."

Do NOT:
- Open with credentials, accomplishments, or prestigious name-drops
- Use hashtags, emojis, or marketing language
- Say "I" more than twice in a row
- Begin with "As a..."
- Write anything that sounds like a LinkedIn post

Return ONLY the Note text. No preamble, no title, no explanation."""


def generate_note(posts: list[dict]) -> str:
    sample = random.sample(posts, min(3, len(posts)))
    posts_text = "\n\n---\n\n".join(
        f"Title: {p['title']}\nDate: {p['date']}\n\n{p['content']}" for p in sample
    )

    client = genai.Client(api_key=GEMINI_API_KEY)

    for attempt in range(5):
        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=(
                    f"Here are some of my recent Substack posts:\n\n{posts_text}\n\n"
                    "Write today's Substack Note. Draw inspiration from the themes and stories above "
                    "but don't just summarize — synthesize something new and resonant."
                ),
                config=genai.types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                    max_output_tokens=2048,
                    temperature=0.9,
                ),
            )
            print(f"Finish reason: {response.candidates[0].finish_reason}")
            print(f"Raw text length: {len(response.text)}")
            return response.text.strip()
        except Exception as e:
            if "503" in str(e) and attempt < 4:
                wait = 15 * (attempt + 1)  # 15s, 30s, 45s, 60s
                print(f"Server busy (attempt {attempt + 1}/5), retrying in {wait}s...")
                time.sleep(wait)
            else:
                raise


def send_email(note: str) -> None:
    today = datetime.now().strftime("%B %d, %Y")
    subject = f"📝 Your Substack Note for {today}"

    html_body = f"""
    <html><body style="font-family: Georgia, serif; max-width: 600px; margin: 40px auto; color: #222; line-height: 1.7;">
      <h2 style="font-size: 18px; color: #555;">Your Substack Note — {today}</h2>
      <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
      <div style="font-size: 16px; white-space: pre-wrap; overflow-wrap: break-word; word-break: normal;">{note}</div>
      <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
      <p style="font-size: 13px; color: #999;">
        Post it at: <a href="https://substack.com/notes">substack.com/notes</a><br>
        Generated by your Substack Notes Agent 🤖
      </p>
    </body></html>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = SENDER_EMAIL
    msg["To"] = RECIPIENT_EMAIL
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(SENDER_EMAIL, GMAIL_APP_PASSWORD)
        server.sendmail(SENDER_EMAIL, RECIPIENT_EMAIL, msg.as_string())
    print(f"✅ Email sent to {RECIPIENT_EMAIL}")


if __name__ == "__main__":
    print("Fetching posts...")
    posts = fetch_posts()
    print(f"  Got {len(posts)} posts.")

    print("Generating note...")
    note = generate_note(posts)
    print(repr(note))  # shows exact string including any truncation
    print(f"Token estimate: ~{len(note.split())} words")
    print(f"\n── Draft Note ──\n{note}\n────────────────")

    print("Sending email...")
    send_email(note)
