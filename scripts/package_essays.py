"""Package the owner's original PDFs and a companion reading note privately.

Requires reportlab and PyMuPDF. Inputs default to private-products/source/.
Never writes paid documents to public/. Original PDF bytes are preserved.
"""
from pathlib import Path
import argparse
import hashlib
import json
import shutil
import zipfile
import pymupdf
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT / 'private-products'
FILES = ('Statement_of_Purpose.pdf', 'Personal_Statement.pdf', 'Reading_Note.pdf')


def reading_note(path):
    ink = colors.HexColor('#263c30')
    label = ParagraphStyle('Label', fontName='Helvetica', fontSize=8, leading=12, textColor=ink, spaceAfter=22)
    title = ParagraphStyle('Title', fontName='Times-Roman', fontSize=30, leading=34, textColor=ink, spaceAfter=18)
    heading = ParagraphStyle('Heading', fontName='Times-Bold', fontSize=13, leading=17, textColor=ink, spaceBefore=14, spaceAfter=7)
    body = ParagraphStyle('Body', fontName='Times-Roman', fontSize=11, leading=16, textColor=ink, spaceAfter=10)
    flow = [Paragraph('THE APPLICATION ESSAYS / PRAMESH SHARMA', label), Paragraph('A note to the reader', title), Paragraph('A research life rarely takes shape in a straight line. These essays bring together the projects, questions, and personal experiences that led me toward a PhD.', body)]
    sections = [
        ('Begin with the research', 'The statement of purpose follows a developing scientific interest through specific projects. Read for the connections between a question, a contribution, and the next problem worth pursuing. Notice how the account moves from describing work to explaining what that work taught me.'),
        ('Read for the person', 'The personal statement returns to experiences outside the lab: chronic illness, learning to program, and finding a way to speak about both. Consider what this essay reveals about motivation that a record of research alone could not convey.'),
        ('Bring the questions to your own work', 'Which experiences changed what you wanted to study? What did you contribute, and how did your understanding change? What does a reader need to know about your life to understand your choices? The most useful details are the ones only you can supply.'),
        ('About this edition', 'The two essays are reproduced in their original PDF form and reflect my experience at the time of writing. They are offered as personal examples for reading and reference. Application requirements differ; let the instructions for your own application guide its form.'),
    ]
    for name, text in sections:
        flow.extend([Paragraph(name, heading), Paragraph(text, body)])
    flow.extend([Spacer(1, 12), Paragraph('Personal-use edition. Redistribution and resale are not included.<br/>For download questions: prameshsharma.com/contact', label)])
    def footer(canvas, doc):
        canvas.setStrokeColor(colors.HexColor('#aab5a9')); canvas.line(54, 42, 558, 42)
        canvas.setFont('Times-Roman', 9); canvas.setFillColor(ink)
        canvas.drawString(54, 28, 'Pramesh Sharma'); canvas.drawRightString(558, 28, str(doc.page))
    SimpleDocTemplate(str(path), pagesize=(612,792), leftMargin=54, rightMargin=54, topMargin=48, bottomMargin=56, title='A Note to the Reader', author='Pramesh Sharma').build(flow, onFirstPage=footer, onLaterPages=footer)


def package(sop=None, personal=None):
    source = PRIVATE / 'source'; source.mkdir(parents=True, exist_ok=True)
    output = PRIVATE / 'phd-essay-bundle'; output.mkdir(parents=True, exist_ok=True)
    originals = [('Statement_of_Purpose.pdf', sop), ('Personal_Statement.pdf', personal)]
    # Validate both inputs before replacing any packaged essays.
    for name, supplied in originals:
        path = Path(supplied) if supplied else source / name
        with pymupdf.open(path) as document:
            if document.needs_pass or not document.is_pdf or len(document) < 1 or not any(page.get_text().strip() for page in document):
                raise ValueError(f'{name} must be a readable, nonempty PDF.')
    for name, supplied in originals:
        if supplied and Path(supplied).resolve() != (source / name).resolve(): shutil.copy2(supplied, source / name)
        shutil.copy2(source / name, output / name)
    reading_note(output / 'Reading_Note.pdf')
    # Explicit membership prevents legacy editable files or source notes entering the sale.
    with zipfile.ZipFile(PRIVATE / 'Pramesh_Sharma_PhD_Essays.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
        for name in FILES: archive.write(output / name, name)
    manifest = {'format': 'PDF', 'files': []}
    for name in FILES:
        with pymupdf.open(output / name) as document: pages = len(document)
        manifest['files'].append({'name': name, 'pages': pages, 'sha256': hashlib.sha256((output / name).read_bytes()).hexdigest()})
    (PRIVATE / 'essay-bundle-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print('Packaged two unchanged essay PDFs and a reading note in the private buyer ZIP.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sop', type=Path, help='Original statement-of-purpose PDF to import')
    parser.add_argument('--personal', type=Path, help='Original personal-statement PDF to import')
    args = parser.parse_args()
    package(args.sop, args.personal)
