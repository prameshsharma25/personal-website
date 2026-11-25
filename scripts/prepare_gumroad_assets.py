"""Prepare local Gumroad upload folders, editorial covers, and listing copy.

Requires reportlab and pymupdf. All output stays in ignored private-products/.
Run package_uc_annotations.py first. No account settings or listings are changed.
"""
from pathlib import Path
import json
import shutil

import pymupdf
from reportlab.lib import colors
from reportlab.pdfgen.canvas import Canvas

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'private-products' / 'gumroad'
INK, CREAM, MUTED = '#13372a', '#f2ede2', '#aac9b6'


def artwork(folder, slug, title, subtitle, detail, square=False):
    width, height = (1200, 1200) if square else (1280, 720)
    stem = slug + ('-thumbnail' if square else '-cover')
    pdf = folder / f'{stem}.pdf'
    c = Canvas(str(pdf), pagesize=(width, height))
    c.setFillColor(colors.HexColor(INK)); c.rect(0, 0, width, height, fill=1, stroke=0)
    c.setStrokeColor(colors.HexColor('#739982')); c.line(70, height-115, width-70, height-115)
    c.setFillColor(colors.HexColor(MUTED)); c.setFont('Helvetica', 14 if square else 12)
    c.drawString(70, height-78, 'APPLICATION WRITING / A PERSONAL COLLECTION')
    c.setFillColor(colors.HexColor(CREAM)); c.setFont('Times-Roman', 102 if square else 76)
    y = height-245 if square else height-230
    for line in title:
        c.drawString(70, y, line); y -= 110 if square else 83
    c.setFont('Helvetica', 23 if square else 18); c.drawString(74, y-20, subtitle)
    c.setFillColor(colors.HexColor(MUTED)); c.setFont('Helvetica', 17 if square else 13)
    c.drawString(74, y-58, detail)
    c.setFillColor(colors.HexColor(CREAM)); c.setFont('Helvetica', 27 if square else 23)
    c.drawString(70, 96, 'Pramesh Sharma')
    c.setFont('Helvetica', 12); c.drawString(71, 68, 'PRAMESHSHARMA.COM')
    # Original vector artwork: two offset sheets, without revealing paid content.
    px, py, pw, ph = (825, 150, 250, 310) if square else (900, 132, 270, 390)
    c.setFillColor(colors.HexColor('#7b9d86')); c.rect(px+15,py-15,pw,ph,fill=1,stroke=0)
    c.setFillColor(colors.HexColor(CREAM)); c.rect(px,py,pw,ph,fill=1,stroke=0)
    c.setFillColor(colors.HexColor(INK)); c.setFont('Helvetica', 10)
    c.drawString(px+25,py+ph-36,'THE PDF EDITION')
    c.setFont('Times-Italic', 36)
    for n,line in enumerate(['Experience.', 'Reflection.', 'Purpose.']):
        c.drawString(px+25,py+ph-115-n*45,line)
    c.setStrokeColor(colors.HexColor('#718876')); c.line(px+25,py+55,px+pw-25,py+55)
    c.setFont('Helvetica',8);c.drawString(px+25,py+30,'PRAMESH SHARMA')
    c.save()
    with pymupdf.open(pdf) as doc:
        doc[0].get_pixmap(alpha=False).save(folder / f'{stem}.png')


def prepare():
    pages = json.loads((ROOT/'private-products/uc-essay-annotations/manifest.json').read_text())['pages']
    products = [
        ('phd-essays', ['My PhD', 'Application', 'Essays'], 'Two essays. One research journey.',
         'STATEMENT OF PURPOSE / PERSONAL STATEMENT / READING NOTE'),
        ('uc-annotations', ['Behind My', 'UC Application', 'Essay'], 'The choices behind the writing.',
         f'ORIGINAL ESSAY / WRITING ANNOTATIONS / {pages}-PAGE PDF'),
    ]
    for slug,title,subtitle,detail in products:
        folder=OUTPUT/slug;folder.mkdir(parents=True,exist_ok=True)
        artwork(folder,slug,title,subtitle,detail)
        artwork(folder,slug,title,subtitle,detail,square=True)
    phd=OUTPUT/'phd-essays';uc=OUTPUT/'uc-annotations'
    shutil.copy2(ROOT/'private-products/Pramesh_Sharma_PhD_Essays.zip',phd/'Pramesh_Sharma_PhD_Essays.zip')
    shutil.copy2(ROOT/'private-products/uc-essay-annotations/UC_Essay_Annotated_Edition.pdf',uc/'UC_Essay_Annotated_Edition.pdf')
    (phd/'listing.txt').write_text('''NAME
My PhD Application Essays

PRICE
$5 USD, one-time purchase

SUMMARY
My statement of purpose and personal statement, presented as individual PDFs with a companion reading note.

DESCRIPTION
How do you put a research direction—and the experiences that led you there—into an application?

This collection brings together my statement of purpose and personal statement. One traces my path through computational research and the questions I want to pursue. The other begins with growing up with Pyruvate Kinase Deficiency and finding a sense of possibility through programming.

Both essays are presented as written, so you can read them as complete pieces. A short reading note offers questions to consider as you work on your own application.

Inside the collection:
• Statement of Purpose — the research experience, questions, and direction behind my application.
• Personal Statement — the experiences that shaped my relationship with science.
• A Note to the Reader — a companion for reading the two essays together.

You will receive three PDFs in one ZIP file. This is a personal collection for reading and reference; it does not include individual editing or application review. Your own experiences and each program’s instructions should guide your writing.

By Pramesh Sharma, computational biologist.

ADDITIONAL DETAILS
Format: Three PDFs in one ZIP
Includes: Statement of Purpose, Personal Statement, Reading Note
Language: English

CONTENT TAB INTRODUCTION
Thank you for reading. Download the ZIP below and open it to find the two essays and the reading note. I suggest starting with A Note to the Reader, then reading the essays together.

RECEIPT MESSAGE
Thanks for reading my application essays. Your download contains the two essays and a reading note. For help with the files, visit prameshsharma.com/contact.

PUBLIC URL
Your screenshot shows https://pramesh6.gumroad.com/l/rzmra. Keep this URL unless you intentionally change the slug.

UPLOADS
Product > Cover: phd-essays-cover.png
Product > Thumbnail: phd-essays-thumbnail.png
Content: Pramesh_Sharma_PhD_Essays.zip
''')
    (uc/'listing.txt').write_text(f'''NAME
Behind My UC Application Essay

PRICE
$5 USD, one-time purchase

SUMMARY
My complete UC essay with personal annotations on its structure, language, and the choices behind the writing.

DESCRIPTION
The finished essay is only part of the story.

In this annotated edition, I return to my University of California application essay and explain the decisions behind it: the opening, the shift between paragraphs, the details I kept, and the ending I chose.

The essay itself is free to read on my website. This edition brings it together with my commentary, so you can move between the finished piece and the thinking behind it.

Inside:
• The complete original essay, included for reference.
• My reflections on what worked in the writing.
• A paragraph-by-paragraph discussion of structure and themes.
• Writing lessons to consider when revising your own essay.

You will receive one {pages}-page PDF. These are my personal reflections, rather than admissions-committee feedback. The guide does not include individual essay review.

Read the free essay: https://prameshsharma.com/mentorship/college-essay

By Pramesh Sharma, computational biologist.

ADDITIONAL DETAILS
Format: PDF
Length: {pages} pages
Includes: Original Essay and Writing Annotations
Language: English

SUGGESTED URL SLUG
uc-essay-annotations (confirm availability in Gumroad before using it on your website)

CONTENT TAB INTRODUCTION
Thank you for reading. The PDF below includes the original essay followed by my annotations. Read the essay first, then revisit it alongside the commentary.

RECEIPT MESSAGE
Thanks for purchasing the annotated edition. Your PDF includes my UC essay and the writing notes that accompany it. For download help, visit prameshsharma.com/contact.

UPLOADS
Product > Cover: uc-annotations-cover.png
Product > Thumbnail: uc-annotations-thumbnail.png
Content: UC_Essay_Annotated_Edition.pdf
''')
    (OUTPUT/'START-HERE.txt').write_text('''GUMROAD UPLOAD PACKAGE

Two separate products are prepared at $5 each. The UC essay remains free on the website; only the accompanying commentary is paid.

1. Open the PhD product draft shown in your screenshot. Use phd-essays/listing.txt for its name, summary, description, and buyer messages.
2. Add the cover PNG and thumbnail PNG in the Product tab. The cover is 1280 × 720; the thumbnail is 1200 × 1200.
3. Upload only the listed buyer file to the Content tab. Do not upload this entire folder, listing.txt, or the artwork-source PDFs as buyer content.
4. Create the UC annotation guide as a separate one-time digital product using uc-annotations/listing.txt and its designated files.
5. Connect your payout method in Gumroad, as requested by the banner in your screenshot.
6. Review and publish each product when ready. While logged into your seller account, use Gumroad’s test-purchase flow and verify the buyer download.
7. Copy the actual public product URLs into PHD_ESSAYS_GUMROAD_URL and UC_ANNOTATIONS_GUMROAD_URL in the website host’s environment settings. Set GUMROAD_SALES_ENABLED=true and redeploy. Leave a product’s URL blank until that specific product is ready.

The PhD product uses Gumroad when its URL is enabled; the existing Stripe integration remains available as a fallback if separately configured. UC annotations are delivered only through Gumroad and are never shipped with the website.

The files in this folder are prepared for upload. No Gumroad dashboard settings have been changed and no sales have been enabled by these scripts.

References:
https://gumroad.com/help/article/149-adding-a-product
https://gumroad.com/help/article/60-adding-a-cover-image
https://gumroad.com/help/article/62-testing-a-purchase
''')
    print('Prepared two Gumroad upload folders: buyer files, covers, thumbnails, listing copy, and receipt messages.')


if __name__ == '__main__':
    prepare()
