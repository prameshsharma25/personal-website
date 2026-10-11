import unittest
import json
import tempfile
from pathlib import Path
from unittest.mock import patch
from scripts.research_opportunities import validate, merge, parse_response, public_source_url, normalize, main, discover, call_gemini, skip_message, check_public_source, ModelResponseError

class ResearchTests(unittest.TestCase):
    def test_skip_log_explains_validation_failure(self):
        message = skip_message('Bioinformatics', self.example(), ValueError('Missing or invalid lab'))
        self.assertIn('A. Researcher', message)
        self.assertIn('example.edu/join', message)
        self.assertIn('Missing or invalid lab', message)

    def test_skip_log_distinguishes_network_errors_without_credentials(self):
        from urllib.error import HTTPError, URLError
        item = self.example()
        item['sourceUrl'] = 'https://user:secret@example.edu/join?token=private'
        for error, expected in [(HTTPError(item['sourceUrl'], 403, 'Forbidden', {}, None), 'HTTP 403'),
                                (TimeoutError(), 'timed out'), (URLError('private details'), 'connection failed')]:
            message = skip_message('Bioinformatics', item, error)
            self.assertIn(expected, message)
            self.assertNotIn('secret', message)
            self.assertNotIn('private', message)

    def example(self):
        return dict(professor='A. Researcher', lab='Example lab', university='Example University',
                    location='California', country='US', areas=['Bioinformatics'], summary='Genome research.',
                    status='general', sourceUrl='https://example.edu/join',
                    evidence='Prospective PhD students should apply through our graduate program.',
                    deadline=None, applicationUrl=None)

    def test_evidence_must_exist(self):
        with self.assertRaises(ValueError): validate(self.example(), '2026-10-11', lambda _: 'No recruiting information')

    def test_no_unsafe_urls(self):
        for url in ['http://example.edu', 'https://127.0.0.1', 'https://localhost', 'javascript:alert(1)', 'https://example.edu:8000']:
            self.assertFalse(public_source_url(url))

    def test_reject_invalid_country_and_deadline(self):
        for field, value in [('country', 'United Kingdom'), ('deadline', '2027-02-30'), ('status', 'verified')]:
            item = self.example(); item[field] = value
            with self.assertRaises(ValueError): validate(item, '2026-10-11', lambda _: normalize(item['evidence']))

    def test_international_sources_and_original_language_evidence(self):
        for country, url, quote in [
            ('GB', 'https://example.ac.uk/join', 'We welcome applications from prospective PhD students.'),
            ('DE', 'https://example.de/jobs', 'Wir suchen eine Doktorandin oder einen Doktoranden.'),
            ('JP', 'https://example.ac.jp/jobs', '博士課程の学生を募集しています。研究内容と応募条件については、この募集案内をご覧ください。'),
            ('ZA', 'https://example.ac.za/jobs', 'We welcome applications from prospective PhD students.'),
            ('BR', 'https://example.br/jobs', 'We welcome applications from prospective PhD students.'),
        ]:
            item = self.example()
            item.update(country=country, sourceUrl=url, applicationUrl=url, evidence=quote)
            result = validate(item, '2026-10-11', lambda _: normalize(quote))
            self.assertEqual(result['country'], country)
            self.assertEqual(result['evidence'], quote)

    def test_private_dns_is_rejected(self):
        with patch('scripts.research_opportunities.socket.getaddrinfo', return_value=[(2, 1, 6, '', ('10.0.0.1', 443))]):
            with self.assertRaisesRegex(ValueError, 'non-public'):
                check_public_source('https://example.org/jobs')

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

    def response(self, text, grounded=False):
        candidate = {'finishReason': 'STOP', 'content': {'parts': [{'text': text}]}}
        if grounded:
            candidate['groundingMetadata'] = {'groundingChunks': [{'web': {'uri': 'https://example.edu/join'}}], 'webSearchQueries': ['PhD']}
        return {'candidates': [candidate]}

    def test_prose_search_uses_separate_structured_extraction(self):
        notes = 'Here are the opportunities I found, with recruiting evidence and sources.'
        with patch('scripts.research_opportunities.call_gemini', side_effect=[
            self.response(notes, True), self.response(json.dumps([self.example()]))
        ]) as api:
            result = discover('Bioinformatics', '2026-10-11', 'test-only', [])
        self.assertEqual(result, [self.example()])
        self.assertEqual(api.call_count, 2)
        search = api.call_args_list[0].args[0]
        extraction = api.call_args_list[1].args[0]
        self.assertIn('worldwide', search['contents'][0]['parts'][0]['text'])
        self.assertNotIn('enum', extraction['generationConfig']['responseSchema']['items']['properties']['country'])
        self.assertIn('tools', search)
        self.assertNotIn('responseSchema', search['generationConfig'])
        self.assertNotIn('tools', extraction)
        self.assertEqual(extraction['generationConfig']['responseMimeType'], 'application/json')
        self.assertIn('responseSchema', extraction['generationConfig'])
        self.assertIn(notes, extraction['contents'][0]['parts'][0]['text'])

    def test_empty_or_ungrounded_search_does_not_extract(self):
        for response in [self.response('', True), self.response('Found opportunities')]:
            with patch('scripts.research_opportunities.call_gemini', return_value=response) as api:
                with self.assertRaises(ValueError): discover('Bioinformatics', '2026-10-11', 'test-only', [])
                self.assertEqual(api.call_count, 1)

    def test_malformed_extraction_is_not_treated_as_no_results(self):
        for text in ['', 'Here are your results', '[null]', '{}', '[1]', '[{"lab":']:
            with self.assertRaises(ValueError): parse_response(self.response(text), require_grounding=False)

    def test_transport_json_error_identifies_stage(self):
        import io
        with patch('scripts.research_opportunities.urlopen', return_value=io.BytesIO(b'<html>Unavailable</html>')):
            with self.assertRaisesRegex(ValueError, 'search: API returned'):
                call_gemini({}, 'test-only', 'Bioinformatics search')

    def test_blocked_area_preserves_valid_results_and_records_warning(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'opportunities.json'
            old = dict(self.example(), id='old', lastChecked='2026-09-01')
            output.write_text(json.dumps({'lastRun': '2026-09-01', 'opportunities': [old]}))
            new = dict(self.example(), id='new', lastChecked='2026-10-11')
            with patch.dict('os.environ', {'GEMINI_API_KEY': 'test-only'}), \
                 patch('sys.argv', ['research', '--output', str(output)]), \
                 patch('scripts.research_opportunities.discover', side_effect=[[self.example()], [], ModelResponseError('RECITATION')]), \
                 patch('scripts.research_opportunities.validate', return_value=new):
                main()
            result = json.loads(output.read_text())
            self.assertEqual({x['id'] for x in result['opportunities']}, {'old', 'new'})
            self.assertEqual(result['scanWarnings'], [{'area': 'Machine learning', 'reason': 'RECITATION'}])
            self.assertEqual(next(x for x in result['opportunities'] if x['id'] == 'old')['lastChecked'], '2026-09-01')

    def test_all_blocked_areas_leave_dataset_unchanged(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'opportunities.json'
            original = json.dumps({'lastRun': '2026-09-01', 'opportunities': []})
            output.write_text(original)
            with patch.dict('os.environ', {'GEMINI_API_KEY': 'test-only'}), \
                 patch('sys.argv', ['research', '--output', str(output)]), \
                 patch('scripts.research_opportunities.discover', side_effect=ModelResponseError('RECITATION')):
                with self.assertRaisesRegex(ModelResponseError, 'All research areas failed'): main()
            self.assertEqual(output.read_text(), original)

    def test_recitation_content_is_never_used(self):
        response = self.response(json.dumps([self.example()]), True)
        response['candidates'][0]['finishReason'] = 'RECITATION'
        with self.assertRaisesRegex(ModelResponseError, 'RECITATION'): parse_response(response)

    def test_literal_null_is_not_a_professor(self):
        item = self.example()
        item['professor'] = 'null'
        with self.assertRaisesRegex(ValueError, 'professor'):
            validate(item, '2026-10-11', lambda _: normalize(item['evidence']))

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
