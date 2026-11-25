"""Verify generated tracker structure and original paid PDF preservation.
Requires openpyxl; formulas is used to exercise real spreadsheet formulas.
"""
from pathlib import Path
import io, contextlib, zipfile
import pymupdf
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
    expected_files={'Statement_of_Purpose.pdf','Personal_Statement.pdf','Reading_Note.pdf'}
    with zipfile.ZipFile(private/'Pramesh_Sharma_PhD_Essays.zip') as z:
        assert z.testzip() is None
        assert set(z.namelist())==expected_files
        for name in expected_files:
            data=z.read(name)
            assert data==(private/'phd-essay-bundle'/name).read_bytes()
            with pymupdf.open(stream=data,filetype='pdf') as doc:
                assert len(doc)>0 and all(page.get_text().strip() for page in doc)
            if name!='Reading_Note.pdf':assert data==(private/'source'/name).read_bytes(),name
        with pymupdf.open(stream=z.read('Reading_Note.pdf'),filetype='pdf') as doc:
            note=' '.join(page.get_text() for page in doc)
            assert all(term not in note for term in ['CBBG','Maryland','DOCX','editable'])
    print('PASS: tracker behavior; exact three-PDF ZIP membership; original essay PDF bytes preserved; school-neutral reading note.')
if __name__=='__main__':run()
