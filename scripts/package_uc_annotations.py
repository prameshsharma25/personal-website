"""Build the paid UC annotation PDF from ignored private source files.

Requires reportlab and pymupdf. This script contains no paid commentary.
"""
from pathlib import Path
import hashlib
import html
import json
import re
import zipfile

import pymupdf
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, HRFlowable

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT / 'private-products' / 'uc-essay-annotations'
INK = colors.HexColor('#1d3c2d')
BODY = ParagraphStyle('Body', fontName='Times-Roman', fontSize=11.5, leading=16.5, spaceAfter=10, textColor=INK)
TITLE = ParagraphStyle('Title', fontName='Times-Roman', fontSize=38, leading=41, spaceAfter=24, textColor=INK)
H2 = ParagraphStyle('Heading', fontName='Times-Roman', fontSize=23, leading=28, spaceAfter=18, textColor=INK, keepWithNext=True)
H3 = ParagraphStyle('Subheading', fontName='Helvetica-Bold', fontSize=10, leading=14, spaceBefore=12, spaceAfter=8, textColor=INK, keepWithNext=True)
LABEL = ParagraphStyle('Label', fontName='Helvetica', fontSize=8, leading=12, spaceAfter=12, textColor=INK)


def inline(text):
    text = html.escape(text)
    return re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)


def footer(canvas, doc):
    canvas.setStrokeColor(colors.HexColor('#9cae9f'))
    canvas.line(54, 44, 558, 44)
    canvas.setFillColor(INK)
    canvas.setFont('Helvetica', 8)
    canvas.drawString(54, 29, 'PRAMESH SHARMA / THE ANNOTATED EDITION')
    canvas.drawRightString(558, 29, str(doc.page))


def package():
    source = (PRIVATE / 'source.md').read_text()
    free = (PRIVATE / 'free-essay-source.mdx').read_text().split('## The Full Essay', 1)[1].strip()
    output = PRIVATE / 'UC_Essay_Annotated_Edition.pdf'
    flow = [Spacer(1, 58), Paragraph('APPLICATION WRITING / THE ANNOTATED EDITION', LABEL),
            HRFlowable(width='100%', thickness=1, color=INK), Spacer(1, 34),
            Paragraph('Behind My<br/>UC Application Essay', TITLE),
            Paragraph('The essay, the structure, and the decisions behind the writing.', BODY),
            Spacer(1, 20), Paragraph('Pramesh Sharma', H2), Spacer(1, 20),
            Paragraph('INSIDE THIS EDITION', LABEL),
            Paragraph('01 / The original essay<br/>02 / What worked<br/>03 / Structure and themes<br/>04 / Writing lessons and takeaways', BODY),
            Spacer(1, 24), Paragraph('A Note on Reading', H3),
            Paragraph('The essay remains free to read at prameshsharma.com/mentorship/college-essay. This edition brings it together with my writing notes. The essay is reproduced as written. These are personal reflections on the writing, not feedback from an admissions committee or an explanation of an admission decision.', BODY),
            Paragraph('PDF edition · November 2026<br/>For personal reading and reference. Redistribution and resale are not included.', LABEL),
            PageBreak(), Paragraph('The Original Essay', H2)]
    for block in free.split('\n\n'):
        if block.strip(): flow.append(Paragraph(inline(block.strip()).replace('\n', '<br/>'), BODY))
    for block in source.split('\n\n'):
        text = block.strip()
        if not text: continue
        if text.startswith('## '):
            flow.extend([PageBreak(), Paragraph(inline(text[3:]), H2)])
        elif text.startswith('### '):
            flow.append(Paragraph(inline(text[4:]), H3))
        else:
            flow.append(Paragraph(inline(text).replace('\n', '<br/>'), BODY))
    SimpleDocTemplate(str(output), pagesize=(612, 792), leftMargin=54, rightMargin=54,
                      topMargin=48, bottomMargin=65, title='Behind My UC Application Essay',
                      author='Pramesh Sharma').build(flow, onFirstPage=footer, onLaterPages=footer)
    with pymupdf.open(output) as doc:
        assert len(doc) > 1 and all(page.get_text().strip() for page in doc)
        pages = len(doc)
    archive = PRIVATE / 'Pramesh_Sharma_UC_Essay_Annotations.zip'
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
        z.write(output, output.name)
    manifest = {'file': output.name, 'pages': pages, 'sha256': hashlib.sha256(output.read_bytes()).hexdigest()}
    (PRIVATE / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'Created private annotation edition: {pages} pages. ZIP contains only the buyer PDF.')


if __name__ == '__main__':
    package()
