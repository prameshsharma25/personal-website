"""Verify generated tracker structure and paid essay text preservation.
Requires openpyxl; formulas is used to exercise real spreadsheet formulas.
"""
from pathlib import Path
import io, contextlib, zipfile
import xml.etree.ElementTree as ET
import openpyxl, formulas
ROOT=Path(__file__).resolve().parents[1]
def run():
    path=ROOT/'public/downloads/lab-search-tracker.xlsx'
    workbook=openpyxl.load_workbook(path)
    assert workbook.sheetnames==['Start Here','Lab Shortlist','Outreach Log','Mentor Fit']
    for sheet in workbook:
        for dv in sheet.data_validations.dataValidation:
            if dv.type=='date':assert dv.formula1=='36526' and dv.formula2=='73415',(dv.formula1,dv.formula2)
    with contextlib.redirect_stderr(io.StringIO()):model=formulas.ExcelModel().loads(str(path)).finish()
    prefix="'[lab-search-tracker.xlsx]OUTREACH LOG'!"
    def status(inputs):
        result=model.calculate(inputs={prefix+k:v for k,v in inputs.items()})
        return result[prefix+'J5'].value[0,0]
    assert status({})==''
    assert status({'A5':'LAB-001'})=='Choose a date'
    assert status({'A5':'LAB-001','F5':36526})=='Overdue'
    assert status({'A5':'LAB-001','F5':'not a date'})=='Check date'
    assert status({'A5':'LAB-001','F5':36526,'D5':'Closed'})=='Closed'
    with zipfile.ZipFile(ROOT/'public/downloads/lab-search-tracker.zip') as z:
        assert z.testzip() is None
        assert set(z.namelist())=={'lab-search-tracker.xlsx','lab-shortlist.csv','outreach-log.csv','mentor-fit.csv','lab-search-quick-start.pdf'}
    private=ROOT/'private-products'
    for source,document in [('statement-of-purpose.txt','Statement_of_Purpose.docx'),('personal-statement.txt','Personal_Statement.docx')]:
        with zipfile.ZipFile(private/'phd-essay-bundle'/document) as z:
            tree=ET.fromstring(z.read('word/document.xml'));text=' '.join(n.text or '' for n in tree.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t'))
        expected=' '.join((private/'source'/source).read_text().split())
        assert ' '.join(text.split())==expected,source
    with zipfile.ZipFile(private/'Pramesh_Sharma_PhD_Essays.zip') as z:
        assert z.testzip() is None
        assert len(z.namelist())==4
        assert all(z.read(p.name)==p.read_bytes() for p in (private/'phd-essay-bundle').iterdir())
    print('PASS: tracker dates and follow-up behavior; ZIP integrity; both essays preserved word-for-word in DOCX.')
if __name__=='__main__':run()
