import unittest
import json
import tempfile
from pathlib import Path
from unittest.mock import patch
from scripts.research_opportunities import validate, merge, parse_response, official_url, normalize, main

class ResearchTests(unittest.TestCase):
    def example(self):
        return dict(professor='A. Researcher', lab='Example lab', university='Example University',
                    location='California', country='US', areas=['Bioinformatics'], summary='Genome research.',
                    status='general', sourceUrl='https://example.edu/join',
                    evidence='Prospective PhD students should apply through our graduate program.',
                    deadline=None, applicationUrl=None)

    def test_evidence_must_exist(self):
        with self.assertRaises(ValueError): validate(self.example(), '2026-10-11', lambda _: 'No recruiting information')

    def test_no_external_or_unsafe_urls(self):
        for url in ['http://example.edu', 'https://example.edu.evil.com', 'https://localhost', 'javascript:alert(1)', 'https://example.edu:8000']:
            self.assertFalse(official_url(url))

    def test_reject_non_us_and_invalid_deadline(self):
        for field, value in [('country', 'UK'), ('deadline', '2027-02-30'), ('status', 'verified')]:
            item = self.example(); item[field] = value
            with self.assertRaises(ValueError): validate(item, '2026-10-11', lambda _: normalize(item['evidence']))

    def test_duplicate_refresh_preserves_other_entries(self):
        item = self.example()
        old = validate(item, '2026-09-01', lambda _: normalize(item['evidence']))
        new = validate(item, '2026-10-11', lambda _: normalize(item['evidence']))
        other = dict(old, id='another', professor='Another researcher')
        result = merge([old, other], [new, new])
        self.assertEqual(len(result), 2)
        self.assertEqual(next(x for x in result if x['id'] == old['id'])['lastChecked'], '2026-10-11')
        self.assertEqual(next(x for x in result if x['id'] == 'another')['lastChecked'], '2026-09-01')

    def test_reject_ungrounded_and_truncated_responses(self):
        for response in [{}, {'candidates': [{'finishReason': 'MAX_TOKENS'}]},
                         {'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': '[]'}]}}]}]:
            with self.assertRaises(ValueError): parse_response(response)

    def test_grounded_empty_response(self):
        response = {'candidates': [{'finishReason': 'STOP', 'groundingMetadata': {'groundingChunks': [{}], 'webSearchQueries': ['PhD']},
                                   'content': {'parts': [{'text': '```json\n[]\n```'}]}}]}
        self.assertEqual(parse_response(response), [])

    def test_api_failure_preserves_dataset(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'opportunities.json'
            original = json.dumps({'lastRun': '2026-09-01', 'opportunities': []})
            output.write_text(original)
            with patch.dict('os.environ', {'GEMINI_API_KEY': 'test-only'}), \
                 patch('sys.argv', ['research', '--output', str(output)]), \
                 patch('scripts.research_opportunities.discover', side_effect=[[], RuntimeError('quota exceeded')]) as request:
                with self.assertRaises(RuntimeError): main()
                self.assertEqual(request.call_count, 2)
            self.assertEqual(output.read_text(), original)

if __name__ == '__main__': unittest.main()
