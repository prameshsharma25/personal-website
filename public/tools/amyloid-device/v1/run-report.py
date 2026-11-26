"""Presentation and export only. Never recalculate or change candidate selection."""

from collections import Counter
from html import escape
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
from urllib.parse import quote
import zipfile


REASONS = {
    "quality_gate_failed": "Quality checks did not pass",
    "incomplete_structural_evidence": "Not all four structural evidence components are available",
    "below_pool_relative_evidence_floor": "Below the pool relative evidence floor",
    "confidence_not_provided": "Required prediction confidence is unavailable",
    "pool_too_small_for_clustering_settings": "Too few structures for the clustering settings",
    "hdbscan_noise": "Assigned to noise by HDBSCAN",
}


def text(value):
    return escape(str(value if value is not None else "Unavailable"), quote=True)


def label(value):
    if value is None:
        return "Unavailable"
    return text("Completed" if value == "complete" else str(value).replace("_", " ").title())


def number(value):
    return f"{value:.3f}".rstrip("0").rstrip(".") if isinstance(value, (int, float)) and math.isfinite(value) else "Unavailable"


def checked_path(root, relative):
    """All artifact links and copies must remain inside the extracted archive."""
    relative = Path(relative)
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError("Invalid report artifact path")
    path = (root / relative).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError("Report artifact escapes the output directory")
    return path


def link(root, path, label):
    if not path or not checked_path(root, path).is_file():
        return "Unavailable"
    return f'<a href="{quote(str(path), safe="/")}">{text(label)}</a>'


def table(headers, rows):
    if not rows:
        return "<p>No entries.</p>"
    return '<div class="table-scroll"><table><thead><tr>' + "".join(f'<th scope="col">{text(h)}</th>' for h in headers) + '</tr></thead><tbody>' + "".join('<tr>' + "".join(f'<td>{cell}</td>' for cell in row) + '</tr>' for row in rows) + '</tbody></table></div>'


def reason_text(member):
    reasons = member.get("eligibility_reasons", [])
    return "; ".join(REASONS.get(reason, reason.replace("_", " ")) for reason in reasons) if reasons else "Eligible but not shortlisted under the diversity rule or candidate limit"


def package_shortlist(root, summary):
    models = {model["id"]: model for model in summary["structures"]}
    exported = []
    for group in summary.get("groups", []):
        if group.get("clustering_status") != "complete":
            continue
        members = {member["id"]: member for member in group.get("members", [])}
        for rank, identity in enumerate(group.get("shortlist", []), 1):
            model, member = models[identity], members[identity]
            if model.get("state") != "complete" or not re.fullmatch(r"[\w-]+", identity) or not re.fullmatch(r"[\w-]+", group["id"]):
                raise ValueError("Invalid shortlisted model identity")
            folder = Path("shortlisted") / group["id"] / f"rank-{rank:02d}-{identity}"
            source = checked_path(root, model["files"]["structure"])
            if not source.is_file():
                raise ValueError("Shortlisted coordinates are missing")
            # Include component files so the copied manifest and report stay usable.
            shutil.copytree(source.parent, root / folder, dirs_exist_ok=True)
            files = {key: str(folder / Path(path).name) for key, path in model["files"].items()}
            if source.suffix.lower() in (".cif", ".mmcif"):
                alignment = checked_path(root, f"alignment/{identity}.pdb")
                if alignment.is_file():
                    target = folder / f"{identity}.alignment-ca.pdb"
                    shutil.copyfile(alignment, root / target)
                    files["alignment_ca_only"] = str(target)
            exported.append({"group": group["id"], "rank": rank, "id": identity,
                "filename": model["filename"], "cluster": member.get("cluster"),
                "evidence_score": member.get("evidence_score"), "rank_score": member.get("rank_score"),
                "files": files, "original_files": model["files"], "source_sha256": model.get("source_sha256")})
    folder = root / "shortlisted"
    folder.mkdir(exist_ok=True)
    (folder / "index.json").write_text(json.dumps(exported, indent=2, allow_nan=False) + "\n")
    (folder / "README.txt").write_text(
        "Shortlisted Structures\n\n"
        "Candidates are ordered within each construct group, not across different groups.\n"
        "Original PDB or mmCIF coordinates and individual reports are copied without changes.\n"
        "Only model index 0 was assessed. Files ending .alignment-ca.pdb contain only C-alpha atoms\n"
        "from the first model, with normalized chain and residue IDs. They are not full structures.\n"
        "Selection applies the configured evidence, confidence, ranking, and diversity rules.\n"
        "It is not experimental confirmation or a probability of amyloid formation.\n\n"
        + ("No candidates were shortlisted. See Run Summary.html and the group annotations.\n" if not exported else "See index.json for scores, filenames, and original artifact paths.\n")
    )
    return exported


def render_report(root, summary, selected):
    models = summary["structures"]
    by_id = {model["id"]: model for model in models}
    groups = summary.get("groups", [])
    failed = [model for model in models if model.get("state") != "complete"]
    problems = [(model["filename"], model.get("error") or model.get("comparison_error")) for model in models if model.get("error") or model.get("comparison_error")]
    problems += [(group["id"], group["error"]) for group in groups if group.get("error")]
    errors = bool(failed or problems or any(group.get("clustering_status") == "failed" for group in groups))
    batch = summary.get("clustering_status") == "requested"
    status = "Completed With Errors" if errors else "Completed"
    selection = "Candidates Shortlisted" if selected else "No Candidates Shortlisted" if batch else "Selection Not Requested"
    counts = [("Structures", len(models)), ("Assessed", len(models) - len(failed)), ("Failed Assessments", len(failed)),
              ("Construct Groups", len(groups)), ("Clusters", sum(len(group.get("representatives", [])) for group in groups)), ("Shortlisted", len(selected))]
    sections = ['<section id="overview"><h2>Run Overview</h2><div class="metrics">' + "".join(f'<div><strong>{value}</strong><span>{label}</span></div>' for label, value in counts) + '</div>',
        f'<p><strong>{selection}.</strong> Completion means the analysis produced an exportable report. Candidate selection is a separate outcome.</p>',
        f'<p>Recorded attempt time: {number(summary.get("elapsed_seconds"))} seconds. This is the recorded calculation attempt, not cumulative time across earlier pauses and resumes.</p>']
    recovery = summary.get("recovery", {})
    if recovery.get("resumed"):
        sections.append(f'<p>Reused {text(recovery.get("reused_descriptors", 0))} saved assessments and {text(recovery.get("reused_alignments", 0))} saved comparisons.</p>')
    sections.append('<p>Browser storage is separate from this exported report. This ZIP remains usable even if the browser could not save its own copy.</p></section>')
    sections.append('<section id="candidates"><h2>Shortlisted Candidates</h2><p>Rank 1 is the first selected candidate within that construct group. Different groups are ranked separately. Selection is exploratory and does not establish experimental success.</p>')
    if selected:
        rows = []
        for item in selected:
            files = item["files"]
            links = [link(root, files.get("structure"), "Original Coordinates"), link(root, files.get("report"), "Individual Report"), link(root, files.get("manifest"), "Manifest")]
            if files.get("alignment_ca_only"):
                links.append(link(root, files["alignment_ca_only"], "Alignment PDB (Cα Only)"))
            confidence = by_id[item["id"]].get("confidence", {})
            rows.append([text(item["group"]), str(item["rank"]), text(item["filename"]) + '<br><small>' + text(item["id"]) + '</small>', text(item["cluster"]), number(item["evidence_score"]), number(item["rank_score"]), number(confidence.get("iptm")), number(confidence.get("mean_plddt")), '<br>'.join(links)])
        sections.append(table(["Group", "Rank", "Structure", "Cluster", "Evidence Score", "Rank Score", "ipTM", "Mean pLDDT", "Files"], rows))
        sections.append('<p>The selected folder preserves original coordinates. For mmCIF inputs, any additional alignment PDB contains Cα atoms only. Individual reports assess the first model.</p>')
    else:
        sections.append('<p>No candidate files were placed in the shortlist folder. ' + ('Review the group outcomes and reasons below. A completed analysis does not guarantee an eligible candidate.' if batch else 'Comparisons and diversity selection were not requested for this run.') + '</p>')
    sections.append('</section><section id="groups"><h2>Clusters And Selection Reasons</h2>')
    if not groups:
        sections.append('<p>No comparison groups were produced.</p>')
    for group in groups:
        gid = group["id"]
        sections.append(f'<article><h3>{text(gid)}</h3><p>Clustering: {label(group.get("clustering_status"))}. Structures: {len(group.get("ids", []))}. Shortlisted candidates: {len(group.get("shortlist", []))}.</p>')
        if group.get("error"):
            sections.append(f'<p class="notice">{text(group["error"])}</p>')
        if group.get("clustering_status") == "insufficient_pool_size":
            sections.append('<p>The pool is too small for the chosen clustering settings. Cluster membership and a diversity shortlist are unavailable.</p>')
        reps = []
        for rep in group.get("representatives", []):
            model = by_id.get(rep["id"], {})
            reps.append([text(rep["cluster"]), text(rep["size"]), text(model.get("filename", rep["id"])), link(root, model.get("files", {}).get("structure"), "Representative Coordinates")])
        if reps:
            sections.append(table(["Cluster", "Members", "Representative", "Structure"], reps))
            sections.append('<p>Representatives are cluster medoids. A representative is not necessarily eligible for the shortlist.</p>')
        members = group.get("members", [])
        noise = sum(member.get("cluster") == -1 for member in members)
        sections.append(f'<p>Noise assignments: {noise}. Cluster numbers are local to this construct group.</p>')
        reasons = Counter(reason for member in members if member.get("selected_rank") is None for reason in member.get("eligibility_reasons", []))
        if reasons:
            sections.append(table(["Eligibility Issue", "Affected Structures"], [[text(REASONS.get(reason, reason)), str(count)] for reason, count in sorted(reasons.items())]))
            sections.append('<p>A structure can have more than one eligibility issue.</p>')
        if members:
            rows = []
            for member in members:
                model = by_id.get(member["id"], {})
                cluster = member.get("cluster")
                selected_rank = member.get("selected_rank")
                rows.append([text(model.get("filename", member["id"])), "Unavailable" if cluster is None else "Noise" if cluster < 0 else text(cluster), number(member.get("evidence_score")), number(member.get("rank_score")), f'Shortlist #{selected_rank}' if selected_rank is not None else text(reason_text(member))])
            sections.append('<details><summary>All Cluster Annotations</summary>' + table(["Structure", "Cluster", "Evidence Score", "Rank Score", "Selection"], rows) + '</details>')
        links = [link(root, f'{gid}/clustering.json', 'Clustering JSON'), link(root, f'{gid}/scored_members.csv', 'Scored Members CSV'), link(root, f'{gid}/distance_matrix.csv', 'Distance Matrix CSV')]
        sections.append('<p>' + ' · '.join(item for item in links if item != "Unavailable") + '</p></article>')
    sections.append('</section><section id="structures"><h2>All Structures</h2>')
    sections.append(table(["Structure", "Assessment", "QC", "Classification", "Files"], [
        [text(model["filename"]) + '<br><small>' + text(model["id"]) + '</small>', label(model.get("state")), label(model.get("qc_status")), label(model.get("classification")), '<br>'.join(link(root, model.get("files", {}).get(key), label) for key, label in [("structure", "Coordinates"), ("report", "Report"), ("manifest", "Manifest")])]
        for model in models]))
    sections.append('</section><section id="issues"><h2>Failures And Warnings</h2>')
    sections.append(table(["Structure Or Group", "Issue"], [[text(name), text(problem)] for name, problem in problems]) if problems else '<p>No calculation failures were recorded.</p>')
    sections.extend(f'<p class="notice">{text(warning)}</p>' for warning in summary.get("warnings", []))
    sections.append('</section><section id="methods"><h2>Selection Criteria And Reproducibility</h2><p>Shortlisting requires passing QC, four evidence components, a pool relative evidence score of at least 50, finite ipTM and mean pLDDT confidence, and membership in a cluster. Eligible candidates are ordered by tier and rank score, then selected greedily with a minimum structural distance of 0.20. The configured candidate limit also applies. An eligible candidate can be omitted because of diversity or that limit.</p><p>Evidence and rank scores describe this uploaded pool. They are not calibrated probabilities. No prediction generation or experimental validation was performed.</p>')
    for heading, payload in [("Run Settings", summary.get("settings")), ("Clustering Backends", [{"group": g["id"], **g.get("clustering_backend", {})} for g in groups]), ("Execution And Versions", {key: summary.get(key) for key in ["execution", "descriptor_execution", "alignment_execution", "provenance"]})]:
        sections.append(f'<details><summary>{heading}</summary><pre>{text(json.dumps(payload, indent=2, allow_nan=False))}</pre></details>')
    sections.append('<p>' + link(root, 'results.json', 'Complete Run Data') + ' · ' + link(root, 'shortlisted/index.json', 'Shortlist Index') + ' · <a href="SHA256.json">File Checksums</a></p></section>')
    return '''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Amyloid Structure Analysis | Run Summary</title><style>
    :root{color-scheme:light;font-family:system-ui,-apple-system,sans-serif;color:#19332b;background:#f5f7f5;line-height:1.65}*{box-sizing:border-box}body{margin:0}header{background:#102b23;color:#ecfff7;padding:3rem max(1rem,calc((100% - 1180px)/2))}header p{color:#b7e5d1}h1{font-size:clamp(2rem,5vw,3.5rem);letter-spacing:-.04em;line-height:1.1}h2{font-size:1.6rem}h3{font-size:1.15rem}main{max-width:1240px;margin:auto;padding:1.5rem}section{padding:1.5rem 0;border-bottom:1px solid #cadbd1}a{color:#0b6548;text-underline-offset:3px;overflow-wrap:anywhere}header a{color:#b9f1dc}nav{display:flex;flex-wrap:wrap;gap:1.2rem}.badge{display:inline-block;padding:.35rem .8rem;border:1px solid #69bb98;border-radius:2rem}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:1rem}.metrics div{background:#e5efe9;border:1px solid #c7dbcf;padding:1rem;border-radius:.7rem}.metrics strong{display:block;font-size:2rem}.metrics span{font-size:.9rem}.table-scroll{overflow-x:auto;border:1px solid #c7dbcf;border-radius:.6rem;margin:1rem 0}table{border-collapse:collapse;width:100%;font-size:.9rem;background:white}th,td{padding:.7rem .8rem;text-align:left;border-bottom:1px solid #dce6df;vertical-align:top;overflow-wrap:anywhere}th{background:#e5efe9}td{min-width:95px}td:nth-child(3){max-width:330px}small{color:#52685c}article{padding:1rem 0 1.5rem}summary{cursor:pointer;font-weight:600;padding:.7rem 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#eaf0ec;padding:1rem;border-radius:.6rem;font-size:.8rem}.notice{border-left:3px solid #c8953a;padding:.5rem 1rem;background:#fff5df}footer{padding:2rem;text-align:center;color:#52685c}p{overflow-wrap:anywhere}@media print{body{background:white;font-size:10pt}header{background:white;color:#19332b;padding:1rem}header p,header a{color:#19332b}nav{display:none}main{padding:0;max-width:none}.table-scroll{overflow:visible}table{table-layout:fixed;font-size:8pt}td{min-width:0}tr{break-inside:avoid}.metrics{grid-template-columns:repeat(3,1fr)}pre{font-size:7pt}}
    </style></head><body><header><p>Pramesh Sharma / Research Tools</p><h1>Amyloid Structure Analysis</h1>''' + f'<span class="badge">{status}</span><p>Run Summary · Extract the full ZIP before opening linked files. Expand the sections you need, then use your browser’s print command to save a PDF.</p><nav aria-label="Report Sections"><a href="#overview">Overview</a><a href="#candidates">Candidates</a><a href="#groups">Clusters</a><a href="#structures">Structures</a><a href="#methods">Methods</a></nav></header><main>' + ''.join(sections) + '</main><footer>Generated from the recorded results of this run. No external scripts, fonts, or network requests are required.</footer></body></html>'


def export_run_report(root, archive_path, summary):
    root, archive_path = Path(root), Path(archive_path)
    selected = package_shortlist(root, summary)
    summary["exports"] = {"summary": "Run Summary.html", "shortlist": "shortlisted/index.json"}
    (root / "results.json").write_text(json.dumps(summary, indent=2, allow_nan=False) + "\n")
    (root / "Run Summary.html").write_text(render_report(root, summary, selected))
    readme = root / "README.txt"
    readme.write_text(readme.read_text() + "\nOpen Run Summary.html after extracting this ZIP for the full run report.\nThe shortlisted/ directory contains selected coordinates and individual reports.\n")
    checksums = {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(root.rglob("*")) if path.is_file() and path.name != "SHA256.json"}
    (root / "SHA256.json").write_text(json.dumps(checksums, indent=2) + "\n")
    # Repackage after adding presentation artifacts. The pinned calculation
    # adapter stays byte-identical so existing descriptor checkpoints can resume.
    with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(root.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(root))
    return json.dumps(summary, allow_nan=False)
