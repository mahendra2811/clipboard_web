#!/usr/bin/env python3
"""Convert espanso/textblaze YAML snippet packs into the Snippet Launcher data
format (categories + templates). Emits seed.js (consumed by the app) and
data.json (kept in sync for backups)."""

import json, re, os

SRC = "/home/pooniya/.config/espanso/match/textblaze"

# filename -> (category id, display name). Order here = order in the UI.
FILES = [
    ("personal.yml",                     "c-personal",  "Personal Info"),
    ("profile-intros.yml",               "c-intro",     "Profile Intros"),
    ("group-intros.yml",                 "c-group",     "Group Intros"),
    ("quick-replies.yml",                "c-quick",     "Quick Replies"),
    ("form-answers.yml",                 "c-form",      "Form Answers"),
    ("linkedin-connection-requests.yml", "c-li-conn",   "LinkedIn Connection Requests"),
    ("linkedin-dms.yml",                 "c-li-dm",     "LinkedIn DMs"),
    ("linkedin-comments.yml",            "c-li-comment","LinkedIn Comments"),
    ("linkedin-referrals.yml",           "c-li-ref",    "LinkedIn Referrals"),
    ("friend-referrals.yml",             "c-friend",    "Friend Referrals"),
    ("email-hr.yml",                     "c-email-hr",  "HR / Application Emails"),
    ("email-person.yml",                 "c-email-peer","Referral Emails (Peer)"),
]

# ---- variable normalisation --------------------------------------------------
def normalize(body):
    if body is None:
        return ""
    # {{form1.Name}} / {{ f.Company }}  ->  {Name} / {Company}
    body = re.sub(r"\{\{\s*[A-Za-z0-9_]+\.([A-Za-z0-9_]+)\s*\}\}", r"{\1}", body)
    # any leftover {{ Something }}  ->  {Something}
    body = re.sub(r"\{\{\s*([A-Za-z0-9_]+)\s*\}\}", r"{\1}", body)
    # espanso form placeholders [[name]] -> {name}
    body = re.sub(r"\[\[\s*([A-Za-z0-9_ ]+?)\s*\]\]", r"{\1}", body)
    # cursor marker $|$ -> {name}
    body = body.replace("$|$", "{name}")
    return body

def clean_title(label, trigger):
    if not label:
        return trigger
    # drop trailing "[form: ...]" / "[cursor -> ...]" annotation
    t = re.sub(r"\s*\[[^\]]*\]\s*$", "", label).strip()
    return t or label

# ---- build -------------------------------------------------------------------
import yaml

categories = []
templates = []
n = 0

for fname, cid, cname in FILES:
    path = os.path.join(SRC, fname)
    with open(path, encoding="utf-8") as fh:
        doc = yaml.safe_load(fh)
    if not doc or "matches" not in doc:
        continue
    categories.append({"id": cid, "name": cname})
    for m in doc["matches"]:
        trigger = (m.get("trigger") or "").strip()
        label = m.get("label") or ""
        # body source: replace (vars-style) OR form (inline-form style)
        if "replace" in m:
            body = normalize(m["replace"])
        elif "form" in m:
            body = normalize(m["form"])
        else:
            continue
        title = clean_title(label, trigger)
        desc_bits = []
        if trigger:
            desc_bits.append(trigger)
        if label and label != title:
            # keep the bracketed hint (field list / cursor note) in desc
            mhint = re.search(r"\[([^\]]*)\]\s*$", label)
            if mhint:
                desc_bits.append(mhint.group(1))
        desc = " — ".join(desc_bits)
        n += 1
        templates.append({
            "id": "es-%03d" % n,
            "cat": cid,
            "title": title,
            "desc": desc,
            "body": body,
        })

state = {"categories": categories, "templates": templates}

with open("data.json", "w", encoding="utf-8") as fh:
    json.dump(state, fh, ensure_ascii=False, indent=2)

with open("seed.js", "w", encoding="utf-8") as fh:
    fh.write("/* Auto-generated from espanso/textblaze packs by convert_espanso.py.\n")
    fh.write("   Loaded before app.js so the app can seed under file:// too. */\n")
    fh.write("window.SEED_DATA = ")
    json.dump(state, fh, ensure_ascii=False, indent=2)
    fh.write(";\n")

print("categories:", len(categories))
print("templates :", len(templates))
