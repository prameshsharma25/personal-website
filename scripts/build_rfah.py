"""Extract deposited RfaH CTD atoms without changing coordinates.

Usage: python3 scripts/build_rfah.py --source-dir /path/to/original-pdb-files
Original downloads: https://files.rcsb.org/download/{2OUG,2LCL}.pdb
Only ATOM records from chain A, first model, and the declared range are retained.
Hydrogens are omitted. Secondary structure records are preserved for cartoons.
"""
import argparse, hashlib, json, math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
AA=dict(zip(['ALA','ARG','ASN','ASP','CYS','GLN','GLU','GLY','HIS','ILE','LEU','LYS','MET','PHE','PRO','SER','THR','TRP','TYR','VAL'],'ARNDCQEGHILKMFPSTWYV'))

def build(source_dir):
    output=ROOT/'public/structures/rfah';output.mkdir(parents=True,exist_ok=True)
    data={}
    for state,pdb,last,method,label in [('alpha','2OUG',156,'X-ray diffraction, 2.10 Å','α-helical hairpin'),('beta','2LCL',162,'Solution NMR, model 1 of 20','β-barrel')]:
        raw=(source_dir/(pdb+'.pdb')).read_bytes();lines=raw.decode().splitlines();atoms=[];annotations=[]
        for line in lines:
            if line.startswith('ENDMDL'):break
            if line.startswith('HELIX') and line[19]=='A' and int(line[21:25])>=115:annotations.append(line)
            if line.startswith('SHEET') and line[21]=='A' and int(line[22:26])>=115:annotations.append(line)
            if line.startswith('ATOM') and line[21]=='A' and 115<=int(line[22:26])<=last and line[16] in [' ','A'] and line[76:78].strip() not in ['H','D']:atoms.append(line)
        ca=[line for line in atoms if line[12:16].strip()=='CA']
        residues=[int(line[22:26]) for line in ca];assert residues==list(range(115,last+1))
        coords=[[float(line[30:38]),float(line[38:46]),float(line[46:54])] for line in ca]
        filename=f'{pdb}-CTD.pdb'
        content='\n'.join(line.rstrip() for line in [f'HEADER    RFAH CTD EXCERPT FROM {pdb}',f'REMARK 900 CHAIN A RESIDUES 115-{last}; FIRST DEPOSITED MODEL',f'REMARK 900 SOURCE https://www.rcsb.org/structure/{pdb}','REMARK 900 ORIGINAL COORDINATES; NO INTERPOLATION OR MISSING-RESIDUE MODELING',*annotations,*atoms,'TER','END'])+'\n'
        (output/filename).write_text(content)
        # Deterministic orthographic fallback; rigid rotations only.
        center=[sum(c[j] for c in coords)/len(coords) for j in range(3)]
        xy=[]
        for c in coords:
            x,y,z=[c[j]-center[j] for j in range(3)]
            a=.8;x,z=x*math.cos(a)+z*math.sin(a),-x*math.sin(a)+z*math.cos(a)
            b=.45;y,z=y*math.cos(b)-z*math.sin(b),y*math.sin(b)+z*math.cos(b)
            xy.append((x,-y))
        span=max(max(p[0] for p in xy)-min(p[0] for p in xy),max(p[1] for p in xy)-min(p[1] for p in xy));scale=240/span
        preview=' '.join(f'{"M" if i==0 else "L"}{210+x*scale:.2f},{175+y*scale:.2f}' for i,(x,y) in enumerate(xy))
        data[state]={'pdb':pdb,'label':label,'chain':'A','model':1,'firstResidue':115,'lastResidue':last,'method':method,'source':f'https://www.rcsb.org/structure/{pdb}','file':f'/structures/rfah/{filename}','atomCount':len(atoms),'residues':residues,'sequence':''.join(AA[line[17:20]] for line in ca),'coordinates':coords,'previewPath':preview,'sourceSha256':hashlib.sha256(raw).hexdigest(),'excerptSha256':hashlib.sha256(content.encode()).hexdigest()}
    assert data['alpha']['sequence']==data['beta']['sequence'][:42]
    (ROOT/'data/rfah.json').write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n')
    print('Saved unchanged deposited CTD coordinates: 2OUG A115–156; 2LCL A115–162, model 1.')
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--source-dir',type=Path,required=True);build(parser.parse_args().source_dir)
