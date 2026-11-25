"""Confidence metadata validation shared by browser and server jobs."""

import csv
import io
import math


def read_confidence(text, filenames):
    reader = csv.DictReader(io.StringIO(text))
    if (
        not reader.fieldnames
        or "filename" not in reader.fieldnames
        or len(set(reader.fieldnames)) != len(reader.fieldnames)
    ):
        raise ValueError(
            "Confidence CSV needs a filename column and unique column names."
        )
    rows = list(reader)
    if len(rows) > len(filenames):
        raise ValueError("Confidence CSV has too many rows.")
    result = {}
    for row in rows:
        name = row.get("filename", "")
        if name not in filenames or name in result:
            raise ValueError(
                "Confidence CSV filenames must uniquely match the uploaded structures."
            )
        item = {
            "method": (row.get("method") or "unspecified").strip()[:80] or "unspecified"
        }
        for key, upper in [("iptm", 1), ("mean_plddt", 100)]:
            value = (row.get(key) or "").strip()
            if not value:
                item[key] = None
                continue
            try:
                number = float(value)
            except ValueError:
                raise ValueError(f"Invalid {key} in confidence CSV.")
            if not math.isfinite(number) or not 0 <= number <= upper:
                raise ValueError(f"{key} is outside its allowed range.")
            item[key] = number
        result[name] = item
    return result
