import copy
import hashlib
from html.parser import HTMLParser
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from urllib.parse import unquote
from zipfile import ZipFile

SPEC = importlib.util.spec_from_file_location("run_report", Path(__file__).resolve().parents[1] / "public/tools/amyloid-device/v1/run-report.py")
REPORT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(REPORT)


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links, self.tags = [], []

    def handle_starttag(self, tag, attrs):
        self.tags.append(tag)
        self.links.extend(value for key, value in attrs if key == "href")


class RunReportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "artifacts"
        self.root.mkdir()
        (self.root / "README.txt").write_text("Original README\n")
        self.archive = Path(self.temp.name) / "results.zip"

    def model(self, identity, suffix="pdb"):
        folder = self.root / identity
        folder.mkdir()
        paths = {"structure": f"{identity}/{identity}.{suffix}", "report": f"{identity}/{identity}.gates.json", "manifest": f"{identity}/{identity}.manifest.json"}
        for key, path in paths.items():
            (self.root / path).write_text(f"original {key} bytes\n")
        (folder / "component.csv").write_text("metric,value\na,1\n")
        return {"id": identity, "filename": f"source-{identity}.{suffix}", "files": paths, "state":"complete", "qc_status":"pass", "classification":"high_support", "confidence":{"iptm":0.8,"mean_plddt":80}}

    def summary(self, models, groups):
        return {"structures":models,"groups":groups,"clustering_status":"requested" if groups else "not_requested", "elapsed_seconds":3.5,"warnings":[],"settings":{"min_cluster_size":2,"min_samples":1,"max_candidates":5}}

    def group(self, identity, model, shortlist=True):
        folder=self.root/identity;folder.mkdir()
        for name in ("clustering.json","scored_members.csv","distance_matrix.csv"):
            (folder/name).write_text("fixture\n")
        return {"id":identity,"ids":[model["id"]],"clustering_status":"complete","shortlist":[model["id"]] if shortlist else [],
            "members":[{"id":model["id"],"cluster":0,"evidence_score":75,"rank_score":65,"selected_rank":1 if shortlist else None,"eligibility_reasons":[] if shortlist else ["confidence_not_provided"]}],
            "representatives":[{"id":model["id"],"cluster":0,"size":1}]}

    def check_archive(self):
        with ZipFile(self.archive) as archive:
            self.assertEqual(len(archive.namelist()),len(set(archive.namelist())))
            checks=json.loads(archive.read("SHA256.json"))
            self.assertEqual(set(checks),set(archive.namelist())-{"SHA256.json"})
            for name, digest in checks.items():
                self.assertEqual(hashlib.sha256(archive.read(name)).hexdigest(),digest)
        parser=Links();parser.feed((self.root/"Run Summary.html").read_text())
        self.assertNotIn("script",parser.tags)
        for href in parser.links:
            if not href.startswith("#"):
                self.assertNotIn(":",href)
                self.assertTrue((self.root/unquote(href)).is_file(),href)

    def test_selected_models_keep_original_bytes_and_science_with_valid_links(self):
        a,b=self.model("model-001"),self.model("model-002","mmcif")
        (self.root/"alignment").mkdir();(self.root/"alignment/model-002.pdb").write_text("C-alpha only\n")
        original=self.summary([a,b],[self.group("group-001",a),self.group("group-002",b)])
        result=json.loads(REPORT.export_run_report(self.root,self.archive,copy.deepcopy(original)))
        self.assertEqual({k:v for k,v in result.items() if k!="exports"},original)
        index=json.loads((self.root/"shortlisted/index.json").read_text())
        self.assertEqual([item["rank"] for item in index],[1,1])
        for item in index:
            for key,path in item["original_files"].items():
                self.assertEqual((self.root/path).read_bytes(),(self.root/item["files"][key]).read_bytes())
        self.assertTrue(index[1]["files"]["structure"].endswith(".mmcif"))
        self.assertTrue(index[1]["files"]["alignment_ca_only"].endswith(".alignment-ca.pdb"))
        self.check_archive()

    def test_empty_shortlist_is_not_a_failed_analysis(self):
        model=self.model("model-001")
        REPORT.export_run_report(self.root,self.archive,self.summary([model],[self.group("group-001",model,False)]))
        html=(self.root/"Run Summary.html").read_text()
        self.assertIn('class="badge">Completed<',html)
        self.assertIn('Required prediction confidence is unavailable',html)
        self.assertEqual(json.loads((self.root/"shortlisted/index.json").read_text()),[])
        self.check_archive()

    def test_independent_analysis_and_escaped_failed_input(self):
        model=self.model("model-001")
        model["filename"]='<script>alert("name")</script>.pdb'
        failed={"id":"model-002","filename":"<img src=x>.pdb","state":"failed","error":"<script>bad()</script>"}
        REPORT.export_run_report(self.root,self.archive,self.summary([model,failed],[]))
        html=(self.root/"Run Summary.html").read_text()
        self.assertIn("Completed With Errors",html)
        self.assertIn("Selection Not Requested",html)
        self.assertIn("&lt;script&gt;",html)
        self.assertNotIn("<script>",html)
        self.check_archive()

    def test_small_and_failed_groups_have_explanations_without_fake_shortlists(self):
        model=self.model("model-001")
        group=self.group("group-001",model,False)
        group.update(clustering_status="insufficient_pool_size",representatives=[])
        group["members"][0].update(cluster=None,eligibility_reasons=["pool_too_small_for_clustering_settings"])
        summary=self.summary([model],[group,{"id":"group-002","ids":[],"clustering_status":"failed","error":"Alignment failed"}])
        REPORT.export_run_report(self.root,self.archive,summary)
        html=(self.root/"Run Summary.html").read_text()
        self.assertIn("The pool is too small",html)
        self.assertIn("Alignment failed",html)
        self.check_archive()

    def test_artifact_paths_cannot_escape_the_output(self):
        for path in ["../outside.pdb", "/tmp/outside.pdb"]:
            with self.assertRaises(ValueError): REPORT.checked_path(self.root,path)


if __name__ == "__main__":
    unittest.main()
