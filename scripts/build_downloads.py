"""Generate public tracker/social cards; add --paid to package ignored essay sources.

Dependencies: XlsxWriter, reportlab, Pillow. Paid source and output stay in
private-products/ (gitignored). Never copy that folder into public/.
"""
from pathlib import Path
from datetime import datetime
from xml.sax.saxutils import escape
import argparse, csv, io, json, re, zipfile
import xlsxwriter
from PIL import Image, ImageDraw, ImageFont
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT/'public/downloads'; PUBLIC.mkdir(parents=True,exist_ok=True)
INK='#163B2C'; GREEN='#ADD9BD'; BLUE='#EAF2FC'
FONTROOT=Path('/System/Library/Fonts/Supplemental')
def fontpath(bold=False):
    mac=FONTROOT/('Arial Bold.ttf' if bold else 'Arial.ttf')
    return str(mac) if mac.exists() else ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
pdfmetrics.registerFont(TTFont('Kit',fontpath()))
pdfmetrics.registerFont(TTFont('KitBold',fontpath(True)))
TITLE=ParagraphStyle('Title',fontName='KitBold',fontSize=28,leading=33,textColor=colors.HexColor(INK),spaceAfter=22)
BODY=ParagraphStyle('Body',fontName='Kit',fontSize=10.5,leading=16,spaceAfter=12,textColor=colors.HexColor('#26372E'))
HEAD=ParagraphStyle('Head',fontName='KitBold',fontSize=14,leading=19,spaceBefore=14,spaceAfter=10,textColor=colors.HexColor(INK))
def pdf(path,flow,label):
    def footer(c,doc):
        c.setFont('Kit',8);c.setFillColor(colors.HexColor('#69766E'))
        c.drawString(50,28,'Pramesh Sharma / '+label);c.drawRightString(562,28,str(doc.page))
    SimpleDocTemplate(str(path),pagesize=(612,792),leftMargin=50,rightMargin=50,topMargin=50,bottomMargin=48).build(flow,onFirstPage=footer,onLaterPages=footer)
def para(s,style=BODY):return Paragraph(escape(s),style)

def tracker():
    wb=xlsxwriter.Workbook(str(PUBLIC/'lab-search-tracker.xlsx'),{'strings_to_formulas':False,'strings_to_urls':False})
    wb.set_properties({'title':'Lab-Search Tracker','author':'Pramesh Sharma'})
    title=wb.add_format({'font_name':'Calibri','font_size':24,'bold':True,'bg_color':INK,'font_color':'white','valign':'vcenter'})
    head=wb.add_format({'bold':True,'bg_color':INK,'font_color':'white','text_wrap':True,'valign':'vcenter'})
    note=wb.add_format({'text_wrap':True,'font_color':'#42594B','valign':'vcenter','font_size':11})
    entry=wb.add_format({'bg_color':BLUE,'font_color':'#1F4C77','text_wrap':True,'valign':'top'})
    dates=wb.add_format({'bg_color':BLUE,'font_color':'#1F4C77','num_format':'mmm d, yyyy'})
    calc=wb.add_format({'bg_color':'#EAF3ED','font_color':INK})
    alert=wb.add_format({'bg_color':'#FBEAE4','font_color':'#893E29'})
    s=wb.add_worksheet('Start Here');s.hide_gridlines(2);s.set_column('A:F',17);s.set_default_row(26)
    s.merge_range('A1:F2','Your next research conversation.',title)
    steps=[('01 / Start with three labs','Add labs to Lab Shortlist. Give each one a simple ID, such as LAB-001. Record its official page, a paper, your research connection, and the actual application route.'),('02 / Write a specific message','Use Outreach Log to record the person you contacted, your sent date, and a follow-up date you choose. Enter dates as spreadsheet dates. The workbook does not send email or calendar reminders.'),('03 / Reflect after a conversation','Use Mentor Fit to record supervision expectations, training, verified funding details, questions, and concerns. It is a reflection worksheet, not an objective ranking.'),('04 / Keep your own copy','Blue cells are editable. Green cells calculate follow-up status. Save a working copy, keep a backup, and do not overwrite formulas. The workbook has 100 shortlist rows, 200 outreach rows, and 100 mentor-fit rows.'),('What the tracker does not know','This is an organizer, not a directory of openings or a substitute for formal applications. Check official sources for eligibility and deadlines. A follow-up date is your choice, not a recommended interval.'),('Privacy and other spreadsheet apps','Your entries stay in the file on your device. No records are uploaded by this workbook. It is designed for Excel. Use the included CSV templates as plain tables in other apps; CSVs do not preserve formulas or dropdowns.')]
    row=4
    for label,body in steps:s.merge_range(row,0,row,5,label,head);s.merge_range(row+1,0,row+2,5,body,note);row+=4
    s.write_url(row,0,'https://prameshsharma.com/mentorship/cold-emailing',string='Read the cold-email guide')
    s.set_portrait();s.fit_to_pages(1,1);s.print_area(0,0,row,5)
    tables={
      'Lab Shortlist':['Lab ID','PI / lab','Institution','Location','Official lab URL','Research theme','Paper / project URL','Why this lab fits','Application route','Deadline','Source last checked','Priority','Notes'],
      'Outreach Log':['Lab ID','Contact name','Contact email','Status','Sent date','Follow-up date','Last reply date','Next action','Days until follow-up','Follow-up status','Notes'],
      'Mentor Fit':['Lab ID','Conversation date','Research connection','Supervision expectations','Training available','Funding details verified','What excites me','Concerns / open questions','Next step'],
    }
    for name,headers in tables.items():
        ws=wb.add_worksheet(name);ws.hide_gridlines(2);ws.set_default_row(34);ws.set_column(0,len(headers)-1,24);ws.set_column(0,0,15);ws.freeze_panes(4,1)
        ws.merge_range(0,0,1,len(headers)-1,name,title);ws.merge_range(2,0,2,len(headers)-1,'Blue = your entries. Keep one row per lab or conversation. Use the same Lab ID across tabs.',note)
        ws.write_row(3,0,headers,head);ws.set_row(3,36)
        last=204 if name=='Outreach Log' else 104
        datecols={'Lab Shortlist':[9,10],'Outreach Log':[4,5,6],'Mentor Fit':[1]}[name]
        for r in range(4,last):
            for c in range(len(headers)):ws.write_blank(r,c,None,dates if c in datecols else entry)
            if name=='Outreach Log':
                n=r+1
                ws.write_formula(r,8,f'=IF(OR(A{n}="",F{n}="",D{n}="Closed"),"",IFERROR(IF(AND(ISNUMBER(F{n}),F{n}>=DATE(2000,1,1),F{n}<=DATE(2100,12,31)),F{n}-TODAY(),""),""))',calc,'')
                ws.write_formula(r,9,f'=IF(A{n}="","",IF(D{n}="Closed","Closed",IF(F{n}="","Choose a date",IF(ISNUMBER(I{n}),IF(I{n}<0,"Overdue",IF(I{n}=0,"Today","Scheduled")),"Check date"))))',calc,'')
        ws.autofilter(3,0,last-1,len(headers)-1)
        for c in datecols:ws.data_validation(4,c,last-1,c,{'validate':'date','criteria':'between','minimum':datetime(2000,1,1),'maximum':datetime(2100,12,31),'show_error':True,'error_type':'stop','error_message':'Enter a valid spreadsheet date between 2000 and 2100.'})
        if name=='Lab Shortlist':ws.data_validation(4,11,last-1,11,{'validate':'list','source':['High','Medium','Low'],'show_error':True})
        if name=='Outreach Log':
            ws.data_validation(4,3,last-1,3,{'validate':'list','source':['Drafting','Sent','Replied','Interview scheduled','Closed'],'show_error':True})
            ws.conditional_format(4,9,last-1,9,{'type':'text','criteria':'containing','value':'Overdue','format':alert})
        buf=io.StringIO();csv.writer(buf).writerow([h for h in headers if h not in ['Days until follow-up','Follow-up status']])
        (PUBLIC/(name.lower().replace(' ','-')+'.csv')).write_text(buf.getvalue())
    wb.close()
    flow=[para('Lab-search tracker',TITLE),para('A quick start / Pramesh Sharma',HEAD)]
    for label,body in steps:flow += [para(label,HEAD),para(body)]
    flow += [para('An example of a specific research connection',HEAD),para('After reading a lab’s recent paper, write one sentence about the question that interests you and one about an experience or skill that connects to it. Keep the lab’s official application route beside your outreach notes.'),para('The free workbook is for your own use. You may share the resource-page link with others. More guides and updates at prameshsharma.com.')]
    pdf(PUBLIC/'lab-search-quick-start.pdf',flow,'Lab-search tracker')
    with zipfile.ZipFile(PUBLIC/'lab-search-tracker.zip','w',zipfile.ZIP_DEFLATED) as z:
        for name in ['lab-search-tracker.xlsx','lab-shortlist.csv','outreach-log.csv','mentor-fit.csv','lab-search-quick-start.pdf']:z.write(PUBLIC/name,name)

def docx(path,paragraphs):
    # Minimal Office Open XML; no macros, embedded media, remote links, or private metadata.
    body=''.join('<w:p><w:pPr><w:spacing w:after="180" w:line="300" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">'+escape(p)+'</w:t></w:r></w:p>' for p in paragraphs)
    document='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+body+'<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"/></w:sectPr></w:body></w:document>'
    with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
        z.writestr('_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
        z.writestr('word/document.xml',document)

def essays():
    private=ROOT/'private-products';out=private/'phd-essay-bundle';out.mkdir(parents=True,exist_ok=True)
    sop=[p.strip() for p in (private/'source/statement-of-purpose.txt').read_text().splitlines() if p.strip()]
    ps=[p.strip() for p in (private/'source/personal-statement.txt').read_text().splitlines() if p.strip()]
    note='These are personal examples from my application writing, preserved as supplied for this edition. They do not claim an admissions outcome. The statement of purpose includes a University of Maryland CBBG section; research and manuscript details reflect the time of writing.'
    flow=[para('My PhD\nApplication Essays'.replace('\n',' '),TITLE),para('Pramesh Sharma / November 2026 edition',HEAD),para('A statement of purpose and a personal statement, read together.'),Spacer(1,24),para(note),para('Use these essays for reading and reflection. Write your own application in your own words. Purchase includes personal use, without redistribution or resale.'),PageBreak(),para('Statement of purpose',TITLE)]
    flow += [para(p) for p in sop]+[PageBreak(),para('Personal statement',TITLE)]+[para(p) for p in ps]
    pdf(out/'PhD_Application_Essays.pdf',flow,'Application essays')
    docx(out/'Statement_of_Purpose.docx',sop);docx(out/'Personal_Statement.docx',ps)
    guide=[para('Read the pair with a purpose.',TITLE),para(note),para('Start with the research thread',HEAD),para('In the statement of purpose, follow how a scientific interest develops through specific projects. Notice where a research question, technical decision, or limitation is connected to what I learned. Then distinguish those experiences from the school-specific discussion at the end.'),para('Then read for the person',HEAD),para('In the personal statement, follow the connection between chronic illness, learning to program, writing, and patient advocacy. Consider what this essay adds that the research-focused statement does not.'),para('Questions for your own draft',HEAD),para('Which experiences changed the questions you want to pursue? What did you actually contribute to a project? What did a setback teach you? Which details help a reader understand your motivations? What belongs in a research statement, and what is better explained in a personal statement?'),para('Use your program’s instructions',HEAD),para('Prompts, length limits, and required documents vary. These examples are not a universal template. Check the program’s current instructions, describe only your own work, and choose details that matter to your particular application.'),para('Files and support',HEAD),para('The combined PDF is for reading. The two DOCX files provide accessible, editable copies of the essays for reference; editing a copy does not make the text your own. For a download problem, contact Pramesh through prameshsharma.com/contact or reply to your purchase email. No personalized admissions review is included.')]
    pdf(out/'Reading_Guide.pdf',guide,'Reading guide')
    with zipfile.ZipFile(private/'Pramesh_Sharma_PhD_Essays.zip','w',zipfile.ZIP_DEFLATED) as z:
        for p in sorted(out.iterdir()):z.write(p,p.name)
    print('Private paid bundle generated; essay wording preserved.')

def social_cards():
    folder=ROOT/'public/images/social';folder.mkdir(parents=True,exist_ok=True)
    cards={'site':('COMPUTATIONAL BIOLOGIST','Protein structure & fold switching'),'lab-search-tracker':('FREE SPREADSHEET + GUIDE','A little structure for your lab search.'),'phd-essay-bundle':('PERSONAL EXAMPLES / $5 BUNDLE','My PhD application essays.')}
    for group in ['posts','guides']:
        for p in (ROOT/group).glob('*.mdx'):
            front=p.read_text().split('---',2)[1]
            raw=re.search(r'^(?:seoTitle):\s*(.*)$',front,re.M) or re.search(r'^title:\s*(.*)$',front,re.M)
            title=json.loads(raw[1]) if raw[1].startswith('"') else raw[1]
            cards[f'{group}-{p.stem}']=('PERSONAL ESSAY' if group=='posts' else 'RESEARCH & APPLICATION GUIDE',title)
    for name,(label,title) in cards.items():
        im=Image.new('RGB',(1200,630),'#080D0A');d=ImageDraw.Draw(im)
        d.rectangle((60,60,66,570),fill=GREEN)
        d.text((105,75),'PRAMESH SHARMA',font=ImageFont.truetype(fontpath(True),24),fill=GREEN)
        d.text((105,140),label,font=ImageFont.truetype(fontpath(),18),fill='#9DAAA1')
        size=60
        while True:
            f=ImageFont.truetype(fontpath(True),size);lines=[];line=''
            for word in title.split():
                candidate=(line+' '+word).strip()
                if d.textlength(candidate,font=f)>980 and line:lines.append(line);line=word
                else:line=candidate
            lines.append(line)
            if len(lines)<=4 or size<=36:break
            size-=2
        for i,line in enumerate(lines):d.text((100,215+i*(size+12)),line,font=f,fill='#F2F6F3')
        d.text((105,550),'prameshsharma.com',font=ImageFont.truetype(fontpath(),22),fill='#9DAAA1')
        im.save(folder/(name+'.png'))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--paid',action='store_true');args=parser.parse_args()
    tracker();social_cards()
    if args.paid:essays()
    print('Public tracker, CSVs, guide, and social cards generated.')
