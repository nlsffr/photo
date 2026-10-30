from email.message import EmailMessage
from email.policy import default
import unittest

from google_mail_policy import get_body, normalize_url, parse_message


AUTH = "mx.google.com; dkim=pass header.i=@google.com header.s=20230601; spf=pass; dmarc=pass header.from=google.com"
SUBJECT = "Notification de Google concernant le contenu soumis à des droits d'auteur"
BODY = """Au propriétaire de https://leakfanhub.com/
Par conséquent, nous procédons à la suppression du contenu signalé des résultats de recherche Google.
Étapes suivantes :
Si vous faites appel, nous pourrons rétablir ces ressources.
Veuillez utiliser l'ID de référence suivant : 1-0787000041693-0530901651
https://lumendatabase.org/notices/101849296
Les URL mises en cause sont les suivantes :
https://leakfanhub.com/example-v2
Besoin d'aide ?
https://leakfanhub.com/not-an-affected-url
Message type: [WNC-594600]
"""


def message(body=BODY, subject=SUBJECT, sender="Google Search Console Team <sc-noreply@google.com>", auth=AUTH):
    msg = EmailMessage(policy=default)
    msg["From"] = sender
    msg["Subject"] = subject
    if auth is not None:
        msg["Authentication-Results"] = auth
    msg.set_content(body)
    return msg


class PolicyTests(unittest.TestCase):
    def test_observed_removal_ignores_conditional_reinstatement_and_unrelated_urls(self):
        decision = parse_message(message())
        self.assertEqual("removal", decision.kind)
        self.assertEqual(("https://leakfanhub.com/example-v2",), decision.urls)
        self.assertEqual("1-0787000041693-0530901651", decision.case_id)
        self.assertEqual("101849296", decision.notice_id)

    def test_unknown_reinstatement_requires_real_template_review(self):
        decision = parse_message(message("We have restored the following URLs: https://leakfanhub.com/example", "Your appeal was accepted"))
        self.assertEqual("review", decision.kind)
        self.assertEqual((), decision.urls)

    def test_same_subject_reply_headers_require_review_even_with_old_removal_body(self):
        for header in ("In-Reply-To", "References"):
            with self.subTest(header=header):
                msg = message("Your appeal is accepted.\n\n" + BODY)
                msg[header] = "<previous-notice@google.com>"
                self.assertEqual("review", parse_message(msg).kind)

    def test_forwarded_or_quoted_old_removal_is_never_a_new_decision(self):
        for quoted in (
            "----- Original Message -----\n" + BODY,
            "---------- Message transféré ---------\n" + BODY,
            "Le 30 octobre, Google a écrit :\n" + BODY,
            "On Friday, Google wrote:\n" + BODY,
            "\n".join("> " + line for line in BODY.splitlines()),
        ):
            with self.subTest(quoted=quoted[:50]):
                msg = message("Your appeal is accepted and the content has been restored.\n\n" + quoted)
                self.assertEqual("review", parse_message(msg).kind)
                self.assertEqual((), parse_message(msg).urls)

    def test_html_quoted_notice_cannot_trigger_a_removal(self):
        msg = message()
        quoted = "<p>Your appeal is accepted.</p><blockquote>" + BODY.replace("\n", "<br>") + "</blockquote>"
        msg.set_content(quoted, subtype="html")
        self.assertEqual("review", parse_message(msg).kind)

    def test_html_quote_indicator_is_checked_even_with_an_unmarked_plain_alternative(self):
        msg = message(BODY)
        msg.add_alternative("<div class='gmail_quote'>" + BODY.replace("\n", "<br>") + "</div>", subtype="html")
        self.assertEqual("review", parse_message(msg).kind)

    def test_technical_indexing_validation_is_not_permission_to_publish(self):
        self.assertEqual("technical", parse_message(message("Les corrections sont validées", "Validation des corrections d’indexation Search Console")).kind)

    def test_reinstatement_words_still_require_review_even_in_search_console_subject(self):
        self.assertEqual("review", parse_message(message("Votre URL est rétablie", "URL rétablie dans Search Console")).kind)

    def test_removal_subject_without_decision_is_review(self):
        self.assertEqual("review", parse_message(message(BODY.replace("nous procédons à la suppression du contenu signalé", "nous pourrons rétablir les ressources"))).kind)

    def test_subject_normalizes_encoded_unicode_apostrophe_and_whitespace(self):
        msg = message(subject=SUBJECT.replace("d'auteur", "d’auteur"))
        self.assertEqual("removal", parse_message(msg).kind)

    def test_spoofed_display_name_and_similar_domain_are_untrusted(self):
        for sender in ('"sc-noreply@google.com" <attacker@example.com>', "sc-noreply@google.com.evil.test"):
            with self.subTest(sender=sender):
                self.assertEqual("untrusted", parse_message(message(sender=sender)).kind)

    def test_missing_or_failed_authentication_is_untrusted(self):
        for auth in (None, AUTH.replace("dkim=pass", "dkim=fail"), AUTH.replace("dmarc=pass", "dmarc=fail"), AUTH.replace("@google.com", "@evil.test")):
            with self.subTest(auth=auth):
                self.assertEqual("untrusted", parse_message(message(auth=auth)).kind)

    def test_later_forged_authentication_cannot_override_first_failure(self):
        msg = message(auth=AUTH.replace("dkim=pass", "dkim=fail"))
        msg["Authentication-Results"] = AUTH
        self.assertEqual("untrusted", parse_message(msg).kind)

    def test_plain_part_is_preferred_even_when_html_is_first(self):
        msg = message()
        msg.set_content("<p>Unrelated HTML</p>", subtype="html")
        msg.add_alternative(BODY, subtype="plain")
        self.assertEqual("removal", parse_message(msg).kind)

    def test_attachment_text_is_not_a_decision(self):
        msg = message("Hello", subject="Your appeal")
        msg.add_attachment(BODY.encode(), maintype="text", subtype="plain", filename="quoted.txt")
        self.assertEqual("review", parse_message(msg).kind)
        self.assertNotIn("WNC-594600", get_body(msg))

    def test_attached_message_subtree_is_not_a_decision(self):
        msg = message("Hello", subject="Your appeal")
        msg.add_attachment(message(), filename="forward.eml")
        self.assertNotIn("WNC-594600", get_body(msg))

    def test_html_fallback_decodes_entities_and_preserves_sections(self):
        msg = message()
        msg.set_content("<html><body>" + "".join("<p>" + line.replace("'", "&#39;") + "</p>" for line in BODY.splitlines()) + "</body></html>", subtype="html")
        self.assertEqual("removal", parse_message(msg).kind)

    def test_declared_charset_is_used(self):
        msg = message()
        msg.set_content(BODY, charset="iso-8859-1")
        self.assertEqual("removal", parse_message(msg).kind)

    def test_urls_are_strictly_local_and_canonicalized(self):
        self.assertEqual("https://leakfanhub.com/example", normalize_url("https://leakfanhub.com:443/example/?q=x#fragment"))
        bad = ["https://leakfanhub.com.evil.test/example", "https://user@leakfanhub.com/example", "https://leakfanhub.com:444/example", "http://leakfanhub.com/example", "https://leakfanhub.com/a/../b", "https://leakfanhub.com/a%2fb", "https://leakfanhub.com/a%5Cb", "https://leakfanhub.com/%252f", "https://leakfanhub.com/%00", "https://leakfanhub.com/a\\b"]
        for url in bad:
            with self.subTest(url=url):
                self.assertIsNone(normalize_url(url))

    def test_invalid_url_in_section_requires_review_instead_of_partial_application(self):
        msg = message(BODY.replace("https://leakfanhub.com/example-v2", "https://attacker.test/example"))
        self.assertEqual("review", parse_message(msg).kind)

    def test_missing_section_and_more_than_maximum_urls_require_review(self):
        self.assertEqual("review", parse_message(message(BODY.replace("Les URL mises en cause sont les suivantes :", "URLs:"))).kind)
        body = BODY.replace("https://leakfanhub.com/example-v2", "\n".join(f"https://leakfanhub.com/example-{i}" for i in range(1001)))
        self.assertEqual("review", parse_message(message(body)).kind)


if __name__ == "__main__":
    unittest.main()
