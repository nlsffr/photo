"""Conservative rules for authenticated Google legal mail.

Only the removal template observed in the mailbox can change publication state.
No genuine reinstatement template has been observed: those replies stay in review.
"""

from dataclasses import dataclass
from email.header import decode_header, make_header
from email.message import Message
from email.utils import getaddresses
from html.parser import HTMLParser
import re
import unicodedata
from urllib.parse import unquote, urlsplit, urlunsplit


ALLOWED_SENDERS = {"sc-noreply@google.com", "legalremovals@google.com"}
REMOVAL_SUBJECT = "notification de google concernant le contenu soumis a des droits d'auteur"
MAX_URLS = 1000
MAX_BODY = 1_000_000


@dataclass(frozen=True)
class Decision:
    kind: str
    reason: str
    urls: tuple[str, ...] = ()
    case_id: str | None = None
    notice_id: str | None = None


def _normalized(text: str) -> str:
    text = text.replace("’", "'").replace("\u00a0", " ")
    text = "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))
    return " ".join(text.lower().split())


def _authenticated(msg: Message) -> bool:
    senders = msg.get_all("From", [])
    if len(senders) != 1:
        return False
    addresses = getaddresses(senders)
    if len(addresses) != 1 or addresses[0][1].lower() not in ALLOWED_SENDERS:
        return False
    # Gmail adds its result before any sender-controlled Authentication-Results.
    # A later, forged result must never overrule the first result.
    results = msg.get_all("Authentication-Results", [])
    if not results:
        return False
    auth = " ".join(results[0].lower().split())
    clauses = [part.strip() for part in auth.split(";")]
    if clauses[0] != "mx.google.com":
        return False
    dkim = any(
        re.match(r"dkim=pass(?:\s|$)", clause)
        and re.search(r"(?:header\.d=google\.com|header\.i=[^\s;]*@google\.com)(?:\s|$)", clause)
        for clause in clauses[1:]
    )
    dmarc = any(
        re.match(r"dmarc=pass(?:\s|$)", clause)
        and re.search(r"header\.from=google\.com(?:\s|$)", clause)
        for clause in clauses[1:]
    )
    return dkim and dmarc


class _HTMLText(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.ignored = 0
        self.quoted = False

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        quote_classes = {"gmail_quote", "yahoo_quoted", "moz-cite-prefix", "gmail_attr"}
        if (tag == "blockquote" or (attributes.get("type") or "").lower() == "cite"
                or quote_classes.intersection((attributes.get("class") or "").split())):
            self.quoted = True
        if tag in {"script", "style"}:
            self.ignored += 1
        if tag in {"br", "p", "div", "li", "tr"}:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in {"script", "style"} and self.ignored:
            self.ignored -= 1
        if tag in {"p", "div", "li", "tr"}:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.ignored:
            self.parts.append(data)


def _body_and_quotes(msg: Message) -> tuple[str, bool]:
    plain, html = [], []

    def collect(part):
        if part.get_content_disposition() == "attachment" or part.get_filename():
            return
        if part.is_multipart():
            for child in part.get_payload():
                collect(child)
            return
        content_type = part.get_content_type()
        if content_type not in {"text/plain", "text/html"}:
            return
        payload = part.get_payload(decode=True)
        if payload is None:
            return
        try:
            text = payload.decode(part.get_content_charset() or "utf-8", "replace")
        except LookupError:
            text = payload.decode("utf-8", "replace")
        (plain if content_type == "text/plain" else html).append(text)

    collect(msg)
    parser = _HTMLText()
    parser.feed("\n".join(html))
    return ("\n".join(plain) if plain else "".join(parser.parts)), parser.quoted


def get_body(msg: Message) -> str:
    return _body_and_quotes(msg)[0]


def _has_quoted_text(body: str) -> bool:
    for line in body.splitlines():
        line = _normalized(line)
        if (line.startswith(">")
                or re.match(r"-{2,}\s*(?:original message|forwarded message|message (?:d'origine|transfere))\b", line)
                or re.match(r"(?:on .+ wrote|le .+ (?:a )?ecrit)\s*:", line)
                or line.startswith(("begin forwarded message:", "debut du message transfere"))):
            return True
    return False


def normalize_url(value: str) -> str | None:
    """Accept only local public HTTPS paths, never credentials or traversal."""
    if any(ord(c) < 33 or ord(c) == 127 for c in value) or "\\" in value:
        return None
    try:
        parsed = urlsplit(value)
        if (parsed.scheme != "https" or parsed.hostname != "leakfanhub.com"
                or parsed.username is not None or parsed.password is not None
                or parsed.port not in {None, 443}):
            return None
        path = parsed.path
        decoded = unquote(path)
        if (not path.startswith("/") or path.startswith("//")
                or re.search(r"%(?:2f|5c|25)", path, re.I)
                or "\\" in decoded
                or any(ord(c) < 32 or ord(c) == 127 for c in decoded)
                or any(p in {".", ".."} for p in decoded.split("/"))):
            return None
        return urlunsplit(("https", "leakfanhub.com", path.rstrip("/") or "/", "", ""))
    except ValueError:
        return None


def parse_message(msg: Message) -> Decision:
    if not _authenticated(msg):
        return Decision("untrusted", "sender_or_authentication_failed")
    if msg.get_all("In-Reply-To") or msg.get_all("References"):
        return Decision("review", "reply_requires_review")
    try:
        subject = _normalized(str(make_header(decode_header(msg.get("Subject", "")))))
    except (LookupError, UnicodeError, ValueError):
        return Decision("review", "invalid_subject_encoding")
    body, quoted_html = _body_and_quotes(msg)
    if len(body) > MAX_BODY:
        return Decision("review", "body_too_large")
    if quoted_html or _has_quoted_text(body):
        return Decision("review", "quoted_or_forwarded_message")
    normalized = _normalized(body)
    if subject != REMOVAL_SUBJECT:
        if ("droit" not in subject and "copyright" not in subject
                and "legal" not in subject and "recours" not in subject
                and "retabli" not in subject and "restor" not in subject
                and any(word in subject for word in ("indexation", "search console", "resultats enrichis"))):
            return Decision("technical", "technical_search_console_message")
        return Decision("review", "unrecognized_decision_template")
    preamble = normalized.split("etapes suivantes", 1)[0]
    if ("nous procedons a la suppression du contenu signale" not in preamble
            or "[wnc-594600]" not in normalized):
        return Decision("review", "removal_decision_not_explicit")
    section = re.search(
        r"Les\s+URL\s+mises\s+en\s+cause\s+sont\s+les\s+suivantes\s*:(.*?)Besoin\s+d['’]aide",
        body, re.I | re.S,
    )
    if section is None:
        return Decision("review", "missing_affected_url_section")
    candidates = re.findall(r'https?://[^\s<>"\')\],;}]+', section.group(1), re.I)
    if not candidates or len(candidates) > MAX_URLS:
        return Decision("review", "invalid_affected_url_count")
    urls = []
    for candidate in candidates:
        url = normalize_url(candidate.rstrip(".,;"))
        if url is None:
            return Decision("review", "invalid_affected_url")
        urls.append(url)
    case = re.search(r"\b\d-\d{13}-\d{10}\b", body)
    notice = re.search(r"https://lumendatabase\.org/notices/(\d+)\b", body)
    return Decision("removal", "explicit_google_removal", tuple(sorted(set(urls))),
                    case.group(0) if case else None, notice.group(1) if notice else None)
