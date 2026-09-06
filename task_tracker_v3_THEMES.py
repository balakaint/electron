# -*- coding: utf-8 -*-
"""
Daily Task Tracker — v3 FINAL
4 Premium Themes · Segoe UI Typography System · Spacing Tokens · Micro-interactions
Requires: Python 3.8+  (tkinter built-in)
Run:  python task_tracker_v3_THEMES.py
"""

import tkinter as tk
from tkinter import filedialog
import math
import textwrap
import re as _re_mod
import time
import json
import os
import subprocess
import sys
import logging
from datetime import datetime, date

# Pillow is optional — only used for the Project Journey cover-image
# banner (crisp cover-fit crop/resize). Everything else in this app
# stays zero-dependency; if Pillow isn't installed, the cover banner
# just falls back to a plain-tkinter (blockier) resize instead of
# crashing the whole app.
try:
    from PIL import (Image as PILImage, ImageTk as PILImageTk,
                     ImageOps as PILImageOps, ImageDraw as PILImageDraw)
    _PIL_OK = True
except Exception:
    _PIL_OK = False

# ── Logging system ─────────────────────────────────────────────────────────────
_LOG_FILE = os.path.join(os.path.expanduser("~"), ".task_tracker.log")
logging.basicConfig(
    filename=_LOG_FILE,
    level=logging.WARNING,
    format="%(asctime)s [%(levelname)s] %(funcName)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("task_tracker")

# ── DPI awareness (Windows) ─────────────────────────────────────────────────────
# Prevents blurry rendering on 125%-200% scaled displays (most modern laptops)


def _set_dpi_awareness():
    """Enable per-monitor DPI awareness on Windows for crisp rendering."""
    try:
        import ctypes
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception:
        try:
            import ctypes
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass


if sys.platform == "win32":
    _set_dpi_awareness()

# ══════════════════════════════════════════════════════════════════════════════
# GLOBAL DESIGN SYSTEM — TYPOGRAPHY + SPACING + MOTION
# ══════════════════════════════════════════════════════════════════════════════
#
# TYPOGRAPHY — Segoe UI on Windows, SF Pro on Mac, Ubuntu on Linux
# One font family, consistent scale — no more Arial+Consolas mixing
#
_F = "Segoe UI"          # primary font everywhere
_FM = "Consolas"         # monospace ONLY for clock digits and timer

# Font scale  — name : (family, size, weight)
F_DISPLAY = (_F, 22, "bold")   # large time display
F_DISPLAY_XL = (_F, 30, "bold")  # hero time display — clock panel
# Negative Tk font sizes are PIXELS (positive = points). The UI spec is
# written in px, so the clock-card type uses px directly — otherwise a
# "42" read as points renders ~56px and overflows the 40% column.
F_CLOCK_HERO = (_F, -40, "bold")  # primary time "04:56 PM"  (spec 40-44px)
F_CLOCK_SEC = (_F, -19)         # seconds ":45"            (spec 18-20px)
F_CLOCK_DATE = (_F, -14)         # date lines               (spec 14px)
F_PHASE_NAME = (_F, -16, "bold")  # activity name (nudged 15->16px for legibility)
F_PHASE_META = (_F, -12)         # time range / percentage  (spec 12px)
F_PHASE_META_B = (_F, -12, "bold")  # same size, bold — ACTIVE phase row only
# FOCUS view — the countdown is the whole point of the screen, so it gets
# hero treatment; the date block that used to dominate is demoted to
# small stat cards.
F_POMO_HERO = (_FM, -50, "bold")  # Pomodoro countdown (spec 48-52px)
F_POMO_CAP = (_F, -12, "bold")   # "FOCUS SESSION" under it
F_STAT_VAL = (_F, -17, "bold")   # stat card value  e.g. "26 days"
F_STAT_CAP = (_F, -11)           # stat card caption e.g. "AUGUST"


def _stat_font(text):
    """Scope-card value font. The three cards are an exact third of a
    fixed-width panel (~85px), and F_STAT_VAL at 17px bold overflows it
    at 8 characters — "120 days" was rendering as "120 day". One step
    down past that length keeps the whole string, which is the point of
    the card; the two-digit case (the common one) is untouched."""
    return F_STAT_VAL if len(text) <= 7 else F_STAT_VAL_SM


F_STAT_VAL_SM = (_F, -15, "bold")  # 3-digit day counts ("120 days")
# The ladder is in NEGATIVE Tk sizes — i.e. pixels, not points — for the
# same reason the clock fonts already were: a point size is multiplied by
# the screen DPI, so the identical code drew 10.7px text on a 96-DPI
# laptop and 13.3px on a 120-DPI one, and only one of those was the size
# anyone designed. In points the bottom of the scale (8pt) landed at
# 10.7px on the common case, under the 12px floor for legible UI text,
# and it is the size 480 labels in this app use.
F_H1 = (_F, -19, "bold")   # panel headers, section titles
F_H2 = (_F, -16, "bold")   # card headers, goal titles
F_H3 = (_F, -15, "bold")   # sub-headers, button labels
F_BODY = (_F, -14)           # body text, task titles
F_BODY_B = (_F, -14, "bold")   # body bold — emphasis
F_SMALL = (_F, -13)           # secondary labels, meta info
F_SMALL_B = (_F, -13, "bold")   # secondary bold — badges, tags
F_XS = (_F, -12)           # timestamps, hints, muted — the 12px floor
F_MONO = (_FM, 20, "bold")  # work timer digits only
F_MONO_SM = (_FM, 9, "bold")  # clock tick numbers

# The three goal horizons, in panel-2 order. One tuple so the save
# payload, the load/migration path and the rebind helper cannot drift
# apart — which is exactly how "monthly" ended up saved but never shown.
GOAL_TYPES = ("yearly", "monthly", "weekly")

# Spacing scale — SP_n in pixels
SP1 = 4   # tight internal padding (icon + label)
SP2 = 8   # compact component padding
SP3 = 12   # default card padding
SP4 = 16   # section padding
SP5 = 24   # panel breathing room
SP6 = 32   # section separation

# ── Hover helper — attaches theme-aware hover to any Button/Label ──────────


def _clip(text, n):
    """Shorten to n chars, cutting at a WORD boundary and marking the cut.

    A raw text[:n] slice was producing lines like "SHIP SPARE EXPORT CAN
    GENERATE 20" — the tail of "2000 $" chopped into a number that reads
    as real. Losing a word visibly is fine; silently changing a figure
    is not."""
    text = (text or "").strip()
    if len(text) <= n:
        return text
    cut = text[:n].rsplit(" ", 1)[0]
    return (cut if len(cut) >= n // 2 else text[:n]).rstrip(" ,.-") + "…"


def _title_case(text):
    """Title Case that doesn't wreck real words.

    str.title() is unusable here: it turns "USA" into "Usa" and "don't"
    into "Don'T", and users type both. Rules instead:
      • a string that is ALL CAPS is shouting, not deliberate casing, so
        it gets lowered first and then title-cased ("VAT RETURN" ->
        "Vat Return") — this is the case that made the line hard to read;
      • a word carrying a capital anywhere after its first letter was
        cased on purpose and is left exactly alone (USA, iPhone, eBay);
      • only ASCII letter-runs are touched, so Bengali text passes
        through untouched — it has no concept of letter case.
    """
    s = (text or "").strip()
    if not s:
        return s
    _letters = [c for c in s if c.isascii() and c.isalpha()]
    if _letters and all(c.isupper() for c in _letters):
        s = s.lower()

    def _fix(m):
        w = m.group(0)
        if any(c.isupper() for c in w[1:]):
            return w
        return w[0].upper() + w[1:]
    return _re_mod.sub(r"[A-Za-z][A-Za-z'’]*", _fix, s)


def _hover(widget, normal_bg, hover_bg, normal_fg=None, hover_fg=None,
           glow=None):
    """Attach enter/leave hover colors to a widget.

    `glow`, if given, adds a 1px accent-colored ring on hover via
    highlightthickness/highlightbackground — both Label and Button support
    these natively, so no extra wrapper frame is needed. It defaults to
    None so every existing call site (hundreds, across all 5 themes) is
    unaffected; pass the caller's own theme accent color to opt in, which
    keeps the glow colour correct for whichever theme is active rather
    than hard-coding one theme's mint."""
    if glow:
        widget.config(highlightthickness=1, highlightbackground=normal_bg,
                      highlightcolor=normal_bg)

    def on_enter(e):
        widget.config(bg=hover_bg)
        if hover_fg:
            widget.config(fg=hover_fg)
        if glow:
            widget.config(highlightbackground=glow, highlightcolor=glow)

    def on_leave(e):
        widget.config(bg=normal_bg)
        if normal_fg:
            widget.config(fg=normal_fg)
        if glow:
            widget.config(highlightbackground=normal_bg,
                          highlightcolor=normal_bg)
    widget.bind("<Enter>", on_enter, add="+")
    widget.bind("<Leave>", on_leave, add="+")


def _round_rect(cv, x0, y0, x1, y1, r, **kw):
    """Draw a filled rounded rectangle on a tk.Canvas.

    Tk has no rounded-rect primitive and no border-radius anywhere, so
    this composes one from two overlapping rectangles plus four corner
    arcs — the standard workaround. It is the ONE place rounded corners
    are actually achievable in this app: widgets (Frame/Button) can't be
    rounded at all, only things drawn on a Canvas.

    `r` is clamped to half the shorter side so a large radius on a short
    bar degrades to a pill instead of drawing inverted arcs."""
    r = max(0, min(r, (x1 - x0) / 2, (y1 - y0) / 2))
    # outline="" is ESSENTIAL, not decorative: Tk's create_arc/rectangle
    # default to a BLACK outline, and width=0 alone does not reliably
    # suppress it on every Tk build. Without it the four corner arcs
    # render as black crop-marks around the card — which is exactly what
    # happened the first time this helper shipped.
    kw.setdefault("outline", "")
    if r <= 0:
        return [cv.create_rectangle(x0, y0, x1, y1, width=0, **kw)]
    d = r * 2
    ids = [cv.create_rectangle(x0 + r, y0, x1 - r, y1, width=0, **kw),
           cv.create_rectangle(x0, y0 + r, x1, y1 - r, width=0, **kw)]
    for ax, ay, start in ((x0, y0, 90), (x1 - d, y0, 0),
                          (x0, y1 - d, 180), (x1 - d, y1 - d, 270)):
        ids.append(cv.create_arc(ax, ay, ax + d, ay + d, start=start,
                                 extent=90, style="pieslice", width=0, **kw))
    return ids


def _add_tooltip(widget, text, bg="#1A1A1A", fg="#FFFFFF", delay=450,
                 side="below"):
    """Small delayed hover tooltip. Used to standardize the icon-only
    buttons in the clock panel's button row (Play, Reset, Music) — they
    previously had no label and no tooltip, so their meaning (Reset
    what? What does the headphone icon do?) depended on the user
    guessing or trial-and-error, unlike "+ Tools" which spells itself
    out. Rather than force text labels onto every button (there isn't
    room for 4 labeled pills in a 560px-wide compact panel), every
    icon-only control now gets the same on-hover explanation.

    `side="below"` (default) is right for a button with clear space
    under it. `side="right"` is for a widget packed tight against
    content below it — e.g. the project-card number badge sits right
    above the notes box, and a tooltip dropped below it lands on top of
    whatever the user just typed there instead of beside the badge."""
    state = {"after_id": None, "win": None}

    def _show():
        if state["win"] is not None:
            return
        try:
            win = tk.Toplevel(widget)
            win.wm_overrideredirect(True)
            win.wm_attributes("-topmost", True)
            lbl = tk.Label(win, text=text, bg=bg, fg=fg, font=F_XS,
                           padx=6, pady=3, bd=0)
            lbl.pack()
            win.update_idletasks()
            if side == "right":
                x = widget.winfo_rootx() + widget.winfo_width() + 8
                y = widget.winfo_rooty()
                win.geometry(f"+{x}+{y}")
            else:
                x = widget.winfo_rootx() + widget.winfo_width() // 2
                y = widget.winfo_rooty() + widget.winfo_height() + 6
                win.geometry(f"+{x - win.winfo_width()//2}+{y}")
            state["win"] = win
        except Exception:
            pass

    def _schedule(e=None):
        state["after_id"] = widget.after(delay, _show)

    def _cancel(e=None):
        if state["after_id"] is not None:
            try:
                widget.after_cancel(state["after_id"])
            except Exception:
                pass
            state["after_id"] = None
        if state["win"] is not None:
            try:
                state["win"].destroy()
            except Exception:
                pass
            state["win"] = None
    widget.bind("<Enter>", _schedule, add="+")
    widget.bind("<Leave>", _cancel, add="+")
    widget.bind("<Button-1>", _cancel, add="+")

# ── Empty state helper — shown when a list has 0 items ────────────────────


def _empty_state(parent, bg, fg_muted, icon, title, subtitle="",
                 chips=None, on_chip=None, accent=None, chip_bg=None):
    """Render a professional empty state placeholder.

    `chips` (optional): a few one-click task suggestions, so an empty
    list — especially in the compact single-panel view, where an empty
    list leaves a lot of otherwise-unused vertical space below it —
    doubles as onboarding instead of just sitting there blank. Purely
    additive: any caller that doesn't pass chips gets the exact old
    behavior."""
    f = tk.Frame(parent, bg=bg)
    f.pack(expand=True, fill="both", pady=SP5)
    tk.Label(f, text=icon, bg=bg, fg=fg_muted, font=(_F, 28)).pack(pady=(SP5, SP2))
    tk.Label(f, text=title, bg=bg, fg=fg_muted, font=F_H3).pack()
    if subtitle:
        tk.Label(f, text=subtitle, bg=bg, fg=fg_muted, font=F_XS).pack(pady=(SP1, 0))
    if chips and on_chip:
        row = tk.Frame(f, bg=bg)
        row.pack(pady=(SP4, 0))
        for text in chips:
            b = tk.Button(row, text=text, command=lambda t=text: on_chip(t),
                          bg=chip_bg or bg, fg=accent or fg_muted,
                          font=F_XS, relief="flat", bd=0, cursor="hand2",
                          padx=SP2, pady=3,
                          highlightthickness=1,
                          highlightbackground=accent or fg_muted,
                          activebackground=chip_bg or bg,
                          activeforeground=accent or fg_muted)
            b.pack(side="left", padx=3)
    return f


# ── Persistence ───────────────────────────────────────────────────────────────
DATA_FILE = os.path.join(os.path.expanduser("~"), ".task_tracker_v6.json")
BACKUP_DIR = os.path.join(os.path.expanduser("~"), ".task_tracker_backups")
LOCK_FILE = os.path.join(os.path.expanduser("~"), ".task_tracker_v6.lock")
BACKUP_KEEP = 14          # days of history kept on disk

# Set by load_data() when the main file was unreadable and a backup was
# used instead. The app shows this once, on screen, at startup — a
# recovery the user is not told about is indistinguishable from data
# loss the next time they look for something that isn't there.
LOAD_NOTICE = {"msg": "", "kind": ""}


def _pid_alive(pid):
    """Is that process still running? ctypes/os only — no pywin32.

    os.kill(pid, 0) is the usual idiom and is CORRECT ON UNIX ONLY. On
    Windows, os.kill sends anything that isn't CTRL_C_EVENT or
    CTRL_BREAK_EVENT straight to TerminateProcess — so the "are you
    alive?" probe would kill the process it is asking about, and once
    Windows has recycled that PID, some unrelated program of the user's
    instead. Windows gets an OpenProcess handle test, which only reads.
    """
    try:
        pid = int(pid)
    except Exception:
        return False
    if pid <= 0:
        return False
    if os.name == "nt":
        try:
            import ctypes
            from ctypes import wintypes
            _QUERY_LIMITED = 0x1000        # PROCESS_QUERY_LIMITED_INFORMATION
            _STILL_ACTIVE = 259
            k32 = ctypes.windll.kernel32
            h = k32.OpenProcess(_QUERY_LIMITED, False, pid)
            if not h:
                return False               # gone, or not ours to look at
            try:
                code = wintypes.DWORD()
                if k32.GetExitCodeProcess(h, ctypes.byref(code)):
                    return code.value == _STILL_ACTIVE
                return True
            finally:
                k32.CloseHandle(h)
        except Exception:
            # Can't tell. Say "not running" so a lock we cannot verify
            # never becomes a locked-out user.
            return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True          # exists, just not ours to signal
    except Exception:
        return False
    return True


def acquire_lock():
    """Claim the save file for this process.

    Returns (ok, other_pid). Two copies of the app both autosaving every
    fifteen seconds is not a race the user can win: whichever one writes
    last wins outright, so anything typed in the other copy is gone with
    no warning and no error. This is the one collision the atomic write
    and the backups cannot help with, because both writes are perfectly
    valid saves of two different truths."""
    try:
        if os.path.exists(LOCK_FILE):
            with open(LOCK_FILE, encoding="utf-8") as f:
                other = int((f.read().split(",")[0] or "0").strip())
            if other and other != os.getpid() and _pid_alive(other):
                return False, other
            # Stale: the previous run crashed or was killed. Taking it
            # over is correct — refusing to start because of a lock left
            # by a process that no longer exists would be worse than the
            # problem the lock solves.
        with open(LOCK_FILE, "w", encoding="utf-8") as f:
            f.write("%d,%d" % (os.getpid(), int(time.time())))
        return True, 0
    except Exception as e:
        log.warning("lock: %s", e)
        return True, 0       # never block startup on the lock itself


def release_lock():
    try:
        if os.path.exists(LOCK_FILE):
            with open(LOCK_FILE, encoding="utf-8") as f:
                if int((f.read().split(",")[0] or "0").strip()) != os.getpid():
                    return   # someone else's lock; leave it alone
            os.remove(LOCK_FILE)
    except Exception as e:
        log.debug("unlock: %s", e)


def _backup_paths():
    """Existing backups, newest first."""
    try:
        names = [n for n in os.listdir(BACKUP_DIR)
                 if n.startswith("backup-") and n.endswith(".json")]
    except Exception:
        return []
    return [os.path.join(BACKUP_DIR, n) for n in sorted(names, reverse=True)]


def _write_backup():
    """Copy today's good data aside, once per day, and prune old copies.

    Deliberately a COPY of the file that was just written and verified,
    not a second serialisation of live state: if something in memory is
    wrong, re-serialising it would faithfully back up the damage."""
    try:
        os.makedirs(BACKUP_DIR, exist_ok=True)
        dest = os.path.join(BACKUP_DIR, "backup-%s.json" % date.today())
        # Copy at most once a day...
        if not os.path.exists(dest):
            with open(DATA_FILE, "r", encoding="utf-8") as src, \
                    open(dest + ".tmp", "w", encoding="utf-8") as out:
                out.write(src.read())
            os.replace(dest + ".tmp", dest)
        # ...but prune on EVERY save, not only on the day's first one.
        # Returning early once today's copy existed meant the very first
        # save of each day was the only chance to prune — and it runs
        # before that day's file is old enough to matter, so in a
        # long-running install the folder simply grew without limit.
        for old in _backup_paths()[BACKUP_KEEP:]:
            try:
                os.remove(old)
            except Exception:
                pass
    except Exception as e:
        log.warning("backup failed: %s", e)


def load_data():
    """Read the save file, falling back through the daily backups.

    THE BUG THIS EXISTS TO PREVENT: this function used to answer any
    read error — a truncated write, a half-synced cloud folder, a disk
    glitch — by quietly returning _default_data(). The app would then
    open looking brand new, and the autosave fifteen seconds later
    would write those empty defaults straight over a file that still
    had every task in it. One unlucky read turned into permanent loss,
    with no error shown at any point.

    Now a file that exists but cannot be parsed is NEVER silently
    discarded: it is moved aside intact, the newest good backup is
    loaded in its place, and the user is told which day they landed on.
    """
    if not os.path.exists(DATA_FILE):
        # Genuinely absent is not the same as unreadable. But if
        # backups exist, the file went missing rather than never
        # existing — recover instead of starting empty.
        for b in _backup_paths():
            try:
                with open(b, encoding="utf-8") as f:
                    d = json.load(f)
                LOAD_NOTICE.update(
                    kind="warn",
                    msg="Save file was missing — restored from %s"
                        % os.path.basename(b)[7:-5])
                return d
            except Exception:
                continue
        return _default_data()
    try:
        with open(DATA_FILE, encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        log.error("main save file unreadable (%s) — trying backups", e)
        try:
            quarantine = DATA_FILE + ".corrupt-%s" % int(time.time())
            os.replace(DATA_FILE, quarantine)
            log.error("bad file kept at %s", quarantine)
        except Exception as _e:
            log.error("could not quarantine bad save file: %s", _e)
        for b in _backup_paths():
            try:
                with open(b, encoding="utf-8") as f:
                    d = json.load(f)
                LOAD_NOTICE.update(
                    kind="warn",
                    msg="Save file was damaged — restored from %s"
                        % os.path.basename(b)[7:-5])
                return d
            except Exception:
                continue
        LOAD_NOTICE.update(
            kind="error",
            msg="Save file was damaged and no backup could be read. "
                "The damaged file was kept, not deleted.")
        return _default_data()


def _default_data():
    """Return fresh default data structure."""
    return {"tasks": [], "work_secs": 0,
            "yearly": [], "monthly": [], "weekly": [],
            "goals_by_project": {}, "goal_project": "proj1",
            "start_date": str(date.today()),
            "progress_date": str(date.today()),
            "progress_secs": 0.0,
            "focus_progress_secs": 0.0,
            "vision_data": {},
            "motto_text": "",
            "work_motto_text": "",
            "mind_note": "",
            "opp_note": "",
            "idea_note": "",
            "mind_title": "",
            "opp_title": "",
            "task_title": "",
            "sec_title_yearly": "",
            "sec_title_monthly": "",
            "sec_title_weekly": "",
            "main_geometry": "",
            "detail_geometry": {},
            "habit_data": {},
            "theme": "focus",
            "onboarded": False,
            "daily_history": {},
            "tasks_focus": [],
            "settings": {},
            "last_review": "",
            "bdp_data": {}}


def save_data(app):
    def clean(lst):
        return [{k: v for k, v in x.items() if not k.startswith("_")} for x in lst]

    def clean_vision(vd):
        result = {}
        for k, v in vd.items():
            # Skip private underscore keys EXCEPT the ones we explicitly want to keep
            if k.startswith("_"):
                # Preserve renamed Quick Notes titles for all 6 projects
                # and every task-list heading. The headings are keyed by
                # view AND day (_task_title, _task_title_tomorrow,
                # _task_title_focus, _task_title_focus_tomorrow); only
                # the CLASSIC/today one used to be persisted via the
                # top-level "task_title" field, so renaming the heading
                # in FOCUS view was silently lost on restart.
                if k.startswith("_qn_title_") or k.startswith("_task_title"):
                    result[k] = v
                continue
            if isinstance(v, dict):
                result[k] = {
                    "title": v.get("title", ""),
                    "note": v.get("note", ""),
                    "detail_note": v.get("detail_note", ""),
                    "detail_tags": v.get("detail_tags", {}),
                    "note_bg": v.get("note_bg", ""),
                    "note_fg": v.get("note_fg", ""),
                    "swot_strengths": v.get("swot_strengths", ""),
                    "swot_weaknesses": v.get("swot_weaknesses", ""),
                    "swot_opportunities": v.get("swot_opportunities", ""),
                    "swot_threats": v.get("swot_threats", ""),
                    # `pid` is on this list for the same reason the ba_*
                    # prefix rule exists above: a project row's id is what
                    # the strike list points AT, and dropping it here
                    # would break that link on the very next save while
                    # everything still looked fine on screen — the exact
                    # silent-data-loss shape this whitelist has already
                    # produced once.
                    "tasks": [
                        {"text": t.get("text", ""), "done": bool(t.get("done", False)),
                         "added_date": t.get("added_date", str(date.today())),
                         "pid": t.get("pid")}
                        for t in v.get("tasks", [])
                        if isinstance(t, dict)
                    ],
                    **{f"box{_bi}_title": v.get(f"box{_bi}_title", "") for _bi in range(12)},
                    **{f"box{_bi}_text": v.get(f"box{_bi}_text", "") for _bi in range(12)},
                    # ── Every ba_* key, by prefix, not by enumeration ──
                    #
                    # BUG THIS FIXES: this whitelist used to list only
                    # ba_box_0..14 explicitly. When the Business Analysis
                    # page was redesigned from 15 numbered boxes to named
                    # sections (ba_idea, ba_analysis, ba_financial,
                    # ba_decision, ba_decision_status, ba_next_action),
                    # none of the new keys were on the list — so every
                    # word typed into that page was written to memory,
                    # shown on screen, reported as "✓ Saved", and then
                    # silently dropped by this function on the very next
                    # save. The page looked like it worked and kept
                    # nothing.
                    #
                    # Matching by prefix instead of by name means the
                    # next field added to that page cannot repeat this.
                    # An explicit list is only safe while someone
                    # remembers it exists, and the whole failure mode
                    # here is that it is invisible: no error, no
                    # traceback, just data that isn't there tomorrow.
                    **{_k: _v for _k, _v in v.items()
                       if isinstance(_k, str) and _k.startswith("ba_")},
                }
        return result
    try:
        payload = {
            "tasks": clean(app.tasks),
            "work_secs": app.work_secs,
            # Goals belong to a PROJECT now. The three flat lists are
            # still written — they are the CURRENTLY SELECTED project's
            # goals — so a file saved by this build still opens in an
            # older one showing something real rather than nothing. On
            # load, goals_by_project wins whenever it is present.
            "goals_by_project": {
                _pk: {_t: clean(_lists.get(_t, []))
                      for _t in GOAL_TYPES}
                for _pk, _lists in getattr(
                    app, "_goals_by_project", {}).items()},
            "goal_project": getattr(app, "_goal_project", "proj1"),
            "yearly": clean(app.yearly),
            "tasks_focus": clean(app.tasks_focus),
            "monthly": clean(app.monthly),
            "weekly": clean(app.weekly),
            "start_date": app.start_date,
            "progress_date": app.progress_date,
            "progress_secs": app.progress_secs,
            "focus_progress_secs": app.focus_progress_secs,
            "vision_data": clean_vision(app.vision_data),
            "motto_text": app.vision_data.get("_motto_text", ""),
            "work_motto_text": app.vision_data.get("_work_motto_text", ""),
            "mind_note": app.vision_data.get("_mind_note", ""),
            "opp_note": app.vision_data.get("_opp_note", ""),
            "idea_note": app.vision_data.get("_idea_note", ""),
            "mind_title": app.vision_data.get("_mind_title", ""),
            "opp_title": app.vision_data.get("_opp_title", ""),
            "task_title": app.vision_data.get("_task_title", ""),
            "sec_title_yearly": app.vision_data.get("_sec_title_yearly", ""),
            "sec_title_monthly": app.vision_data.get("_sec_title_monthly", ""),
            "sec_title_weekly": app.vision_data.get("_sec_title_weekly", ""),
            "main_geometry": getattr(app, "_last_geometry", None) or app.winfo_geometry(),
            "detail_geometry": getattr(app, "_detail_geometries", {}),
            "habit_data": getattr(app, "_habit_data", {}),
            "theme": getattr(app, "_mode", "focus"),
            "onboarded": bool(getattr(app, "_onboarded", False)),
            "pomo": {**getattr(app, "_pomo", {}),
                     "saved_at": time.time()} if hasattr(app, "_pomo") else {},
            "daily_history": getattr(app, "_daily_history", {}),
            "settings": getattr(app, "_settings", {}),
            "last_review": getattr(app, "_last_review", ""),
            "bdp_data": app.vision_data.get("self_dev", {}),
        }
        # Write to temp file first, then rename — prevents data loss on crash
        tmp = DATA_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
            # flush + fsync BEFORE the rename, not after. os.replace is
            # atomic with respect to the file NAME, but not to the disk:
            # on a power cut the rename can land while the bytes are
            # still in the OS cache, and the good file is then replaced
            # by a zero-length one. Forcing the data down first makes
            # the rename mean what it looks like it means.
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, DATA_FILE)
        # Only now, with a verified file on disk, take the daily copy.
        _write_backup()
    except Exception as e:
        log.error("save_data failed: %s", e)
        try:
            with open(DATA_FILE + ".err", "a", encoding="utf-8") as ef:
                import traceback
                ef.write(traceback.format_exc() + "\n")
        except Exception:
            pass

# ── Theme definitions ─────────────────────────────────────────────────────────
# 4 PREMIUM THEMES — cycle with the theme button
# 1. "focus"   — Clean minimal calm (luxury Swiss planner, light)
# 2. "warroom" — Dark premium focused (serious achiever war room)
# 3. "energy"  — Bold energetic motivational (high-performance coach)
# 4. "corporate"— Modern corporate elevated (Notion/Linear premium)


THEMES = {
    # ══════════════════════════════════════════════════════════════════════════
    # THEME 1 — FOCUS (Calm · Light · Premium Paper — inspired by Linear Light)
    # Base: warm stone white. Accent: deep slate blue. Used by: Linear, Craft
    # ══════════════════════════════════════════════════════════════════════════
    "focus": {
        "BG": "#F7F6F3",   # warm stone canvas — premium paper
        "CARD_BG": "#FFFFFF",   # pure white card surface
        "CARD_BORDER": "#E8E5E0",   # subtle warm border
        "TEXT": "#1A1A1A",   # near-black — maximum legibility
        "TEXT2": "#514F4B",   # warm gray secondary
        "TEXT3": "#6F6961",   # muted placeholder
        "GREEN": "#2960E6",   # slate blue — Linear's signature action color
        "GREEN2": "#2D5DD4",   # darker blue hover
        "GREEN_LIGHT": "#EEF2FF",   # faint blue tint
        "YELLOW": "#926200",   # amber warning
        "RED": "#C41E3A",   # classic red danger
        "DONE_GREEN": "#117B38",   # clean green done
        "ORANGE": "#2960E6",   # blue headers (consistent accent)
        "DARK": "#0D0D0D",   # absolute black
        "RUNNING_BG": "#EEF2FF",   # blue tint running bg
        "RUNNING_GREEN": "#2960E6",
        "WHITE": "#FFFFFF",
        "QUOTE_BG": "#1A1A1A",   # deep black motto bar
        "DATE_BG": "#F7F6F3",
        "TIMER_FG": "#2960E6",   # blue timer digits
        "INPUT_BG": "#F0EEE9",   # warm stone input
        "INPUT_FG": "#1A1A1A",
        "THEME_ICON": "◎",
        "THEME_LABEL": "FOCUS",
        "SECTIONS": [
            ("yearly", "SHORT TERM GOAL", "#2960E6", "#FFFFFF", "◈"),
            ("monthly", "MID TERM GOAL", "#6D28D9", "#FFFFFF", "❖"),
            ("weekly", "LONG TERM GOAL", "#0F766E", "#FFFFFF", "◆"),
        ],
    },

    # ══════════════════════════════════════════════════════════════════════════
    # THEME 2 — WAR ROOM (Dark · Command · Precision — inspired by Raycast)
    # Base: deep charcoal. Accent: electric cyan. Used by: Raycast, Arc browser
    # ══════════════════════════════════════════════════════════════════════════
    "warroom": {
        "BG": "#0C0C0F",   # near-black charcoal
        "CARD_BG": "#141417",   # slightly lifted card
        "CARD_BORDER": "#242428",   # dark border, barely visible
        "TEXT": "#EDEDEF",   # cool off-white — crisp
        "TEXT2": "#A1A1A9",   # mid gray secondary
        "TEXT3": "#7F7F8D",   # very muted placeholder
        "GREEN": "#22D3EE",   # electric cyan — Raycast signature
        "GREEN2": "#06B6D4",   # deeper cyan hover
        "GREEN_LIGHT": "#061820",   # near-black cyan tint
        "YELLOW": "#FBBF24",   # gold alert
        "RED": "#F87171",   # soft red danger
        "DONE_GREEN": "#22D3EE",   # cyan done
        "ORANGE": "#FBBF24",   # gold headers
        "DARK": "#050507",   # absolute darkest
        "RUNNING_BG": "#051015",   # deep cyan running bg
        "RUNNING_GREEN": "#22D3EE",
        "WHITE": "#141417",
        "QUOTE_BG": "#050507",   # darkest motto bar
        "DATE_BG": "#0C0C0F",
        "TIMER_FG": "#22D3EE",   # cyan timer
        "INPUT_BG": "#0F0F13",   # deep input
        "INPUT_FG": "#EDEDEF",
        "THEME_ICON": "◈",
        "THEME_LABEL": "WAR ROOM",
        "SECTIONS": [
            ("yearly", "SHORT TERM GOAL", "#22D3EE", "#141417", "◈"),
            ("monthly", "MID TERM GOAL", "#FBBF24", "#141417", "❖"),
            ("weekly", "LONG TERM GOAL", "#A78BFA", "#141417", "◆"),
        ],
    },

    # ══════════════════════════════════════════════════════════════════════════
    # THEME 3 — ENERGY (Bold · Warm · Action — inspired by Superhuman)
    # Base: warm off-white. Accent: vivid coral-red. Used by: Superhuman, Framer
    # ══════════════════════════════════════════════════════════════════════════
    "energy": {
        "BG": "#FAFAF8",   # near-white warm base
        "CARD_BG": "#FFFFFF",   # pure white card
        "CARD_BORDER": "#EBEBEB",   # neutral light border
        "TEXT": "#111111",   # pure near-black
        "TEXT2": "#535353",   # neutral gray secondary
        "TEXT3": "#6F6F6F",   # muted placeholder
        "GREEN": "#D02222",   # vivid red-coral — Superhuman action
        "GREEN2": "#B91C1C",   # darker red hover (fix: was same as GREEN)
        "GREEN_LIGHT": "#FEE2E2",   # faint red tint
        "YELLOW": "#A15904",   # amber warning
        "RED": "#D02222",   # red danger
        "DONE_GREEN": "#117B38",   # clean green done
        "ORANGE": "#D02222",   # red headers
        "DARK": "#0A0A0A",   # absolute dark
        "RUNNING_BG": "#FEE2E2",   # red tint running
        "RUNNING_GREEN": "#D02222",
        "WHITE": "#FFFFFF",
        "QUOTE_BG": "#D02222",   # vivid red motto bar — bold statement
        "DATE_BG": "#FAFAF8",
        "TIMER_FG": "#D02222",   # red timer
        "INPUT_BG": "#F5F5F3",   # subtle warm input
        "INPUT_FG": "#111111",
        "THEME_ICON": "▲",
        "THEME_LABEL": "ENERGY",
        "SECTIONS": [
            ("yearly", "SHORT TERM GOAL", "#D02222", "#FFFFFF", "◈"),
            ("monthly", "MID TERM GOAL", "#A15904", "#FFFFFF", "❖"),
            ("weekly", "LONG TERM GOAL", "#117B38", "#FFFFFF", "◆"),
        ],
    },

    # ══════════════════════════════════════════════════════════════════════════
    # THEME 4 — EXECUTIVE (Warm · Premium · Authority — inspired by Notion/FT)
    # Base: warm ivory. Accent: deep amber. Used by: Notion, Bloomberg, FT
    # ══════════════════════════════════════════════════════════════════════════
    "corporate": {
        "BG": "#FAF8F5",   # warm ivory canvas
        "CARD_BG": "#FFFFFF",   # pure white card
        "CARD_BORDER": "#E7E2DB",   # warm stone border
        "TEXT": "#1C1917",   # deep warm near-black
        "TEXT2": "#55504D",   # warm stone secondary
        "TEXT3": "#726B66",   # muted warm placeholder
        "GREEN": "#AE5009",   # deep amber — authority & premium
        "GREEN2": "#92400E",   # darker amber hover
        "GREEN_LIGHT": "#FEF3C7",   # faint amber tint
        "YELLOW": "#A15904",   # amber warning
        "RED": "#D02222",   # pure red danger
        "DONE_GREEN": "#0C4A6E",   # deep navy done — strong contrast pair
        "ORANGE": "#AE5009",   # amber headers
        "DARK": "#0C0A09",   # deepest warm black
        "RUNNING_BG": "#FFFBEB",   # faint amber running bg
        "RUNNING_GREEN": "#AE5009",
        "WHITE": "#FFFFFF",
        "QUOTE_BG": "#1C1917",   # deep warm black motto bar
        "DATE_BG": "#FAF8F5",
        "TIMER_FG": "#AE5009",   # amber timer
        "INPUT_BG": "#F5F1EC",   # warm input zone
        "INPUT_FG": "#1C1917",
        "THEME_ICON": "◇",
        "THEME_LABEL": "EXECUTIVE",
        "SECTIONS": [
            ("yearly", "SHORT TERM GOAL", "#AE5009", "#FFFFFF", "◈"),
            ("monthly", "MID TERM GOAL", "#1D4ED8", "#FFFFFF", "❖"),
            ("weekly", "LONG TERM GOAL", "#117B38", "#FFFFFF", "◆"),
        ],
    },

    # ══════════════════════════════════════════════════════════════════════════
    # THEME 5 — JOURNEY (Dark · Calm · Emerald — the Project Journey palette)
    # Base: deep emerald. Accent: bright mint. Same colours as the standalone
    # Project Journey page, now selectable for the whole app.
    # ══════════════════════════════════════════════════════════════════════════
    "journey": {
        "BG": "#0D1110",   # deep emerald canvas
        "CARD_BG": "#161B19",   # lifted emerald card
        "CARD_BORDER": "#2A3731",   # subtle emerald border
        "TEXT": "#FFFFFF",   # pure white — maximum crispness on dark emerald
        "TEXT2": "#9FC2AE",   # muted mint-gray secondary
        "TEXT3": "#6C8A7E",   # very muted placeholder
        "GREEN": "#4CE0A0",   # bright mint — this theme's signature
        "GREEN2": "#38B384",   # deeper mint hover
        "GREEN_LIGHT": "#17211D",   # near-black mint tint
        "YELLOW": "#F5C451",   # warm gold alert
        "RED": "#F0776B",   # soft coral danger
        "DONE_GREEN": "#4CE0A0",   # mint done
        "ORANGE": "#4CE0A0",   # mint headers (consistent accent)
        "DARK": "#070908",   # absolute darkest emerald
        "RUNNING_BG": "#17211D",   # mint tint running bg
        "RUNNING_GREEN": "#4CE0A0",
        "WHITE": "#161B19",
        "QUOTE_BG": "#070908",   # darkest motto bar
        "DATE_BG": "#0D1110",
        "TIMER_FG": "#4CE0A0",   # mint timer
        "INPUT_BG": "#121715",   # deep emerald input
        "INPUT_FG": "#FFFFFF",
        "THEME_ICON": "❖",
        "THEME_LABEL": "JOURNEY",
        "SECTIONS": [
            ("yearly", "SHORT TERM GOAL", "#4CE0A0", "#0D1110", "◈"),
            ("monthly", "MID TERM GOAL", "#7DD3FC", "#0D1110", "❖"),
            ("weekly", "LONG TERM GOAL", "#F5C451", "#0D1110", "◆"),
        ],
    },

    # ══════════════════════════════════════════════════════════════════════════
    # THEME 6 — RIZE (Clean · Airy · Minimal — inspired by Rize's time tracker)
    # Base: pure white. Accent: soft indigo. Barely-there grey lines, almost no
    # visual weight anywhere except the thing you're meant to act on.
    # ══════════════════════════════════════════════════════════════════════════
    "rize": {
        "BG": "#FFFFFF",   # pure white canvas — no warm/cool tint at all
        "CARD_BG": "#FFFFFF",   # card is the same white as the page
        "CARD_BORDER": "#E5E7EB",   # hairline neutral grey border
        "TEXT": "#111827",   # near-black slate — crisp but not pure black
        "TEXT2": "#545964",   # neutral grey secondary
        "TEXT3": "#6C7586",   # light grey placeholder
        "GREEN": "#5255EF",   # soft indigo — Rize's signature accent
        "GREEN2": "#4F46E5",   # darker indigo hover
        "GREEN_LIGHT": "#EEF2FF",   # faint indigo tint
        "YELLOW": "#A15904",   # amber warning
        "RED": "#D02222",   # standard red danger
        "DONE_GREEN": "#117B38",   # clean green done
        "ORANGE": "#5255EF",   # indigo headers (consistent accent)
        "DARK": "#111827",   # near-black, not pure black
        "RUNNING_BG": "#EEF2FF",   # indigo tint running bg
        "RUNNING_GREEN": "#5255EF",
        "WHITE": "#FFFFFF",
        "QUOTE_BG": "#111827",   # dark slate motto bar
        "DATE_BG": "#FFFFFF",
        "TIMER_FG": "#5255EF",   # indigo timer digits
        "INPUT_BG": "#FFFFFF",   # was #F9FAFB. Rize is a WHITE theme; a fill one
        # step off white gave every input, note box and task row a
        # faint ash cast without ever being different enough to read
        # as a separate surface. Definition comes from the hairline
        # CARD_BORDER instead, which is what a flat theme is for.
        "_INPUT_BG_WAS": "#F9FAFB",   # near-white input, barely distinct from BG
        "INPUT_FG": "#111827",
        "THEME_ICON": "○",
        "THEME_LABEL": "RIZE",
        "SECTIONS": [
            ("yearly", "SHORT TERM GOAL", "#5255EF", "#FFFFFF", "◈"),
            ("monthly", "MID TERM GOAL", "#BE185D", "#FFFFFF", "❖"),
            ("weekly", "LONG TERM GOAL", "#0F766E", "#FFFFFF", "◆"),
        ],
    },
}

# Theme cycle order
THEME_ORDER = ["focus", "warroom", "energy", "corporate", "journey", "rize"]

# ── Per-theme panel color palette ─────────────────────────────────────────────
# Used by _build_right, _build_projects, habit tracker, and all sub-panels
# so every panel is consistent with the 4-theme system.
# Format: (card_bg, header_gold, input_bg, input_fg, sec_text, border,
#           pill_bg, pill_fg, muted, active_btn, task_row_alt, pb_empty,
#           link_fg, del_hover, comp_check_bg, note_bg, swot_header_fg)
_PANEL_COLORS = {
    "focus": {
        "hdr_gold": "#2960E6",   # slate blue header on warm stone
        "card2": "#FFFFFF",
        "input_bg": "#F0EEE9",
        "input_fg": "#1A1A1A",
        "sec_text": "#6E6B66",
        "border": "#E8E5E0",
        "pill_bg": "#FFFFFF",
        "pill_fg": "#2960E6",
        "muted": "#6F6961",
        "active_btn": "#DDEAFF",
        "task_alt": "#F5F4F1",
        # Was the same value as active_btn (#DDEAFF) — a progress bar's
        # EMPTY track was tinted as loud as a hover/active state, so a
        # goal at 1/30 read as "almost full" purely from color weight.
        # Neutral warm gray now: the track just recedes, and only the
        # actual filled portion (the rainbow ramp) carries color.
        "pb_empty": "#E9E6E0",
        "link_fg": "#2960E6",
        "del_hover": "#C41E3A",
        "note_bg": "#F5F4F1",
        "swot_hdr": "#2960E6",
        "menu_bg": "#FFFFFF",
        "menu_hover": "#F0EEE9",
        "menu_fg": "#1A1A1A",
        "ctrl_bg": "#F0EEE9",    # control bg on card2 surface (same as input_bg)
        "ctrl_bd": "#D4D0CA",    # border for controls on card2
    },
    "warroom": {
        "hdr_gold": "#22D3EE",   # electric cyan title on dark
        "card2": "#141417",
        "input_bg": "#0F0F13",
        # input_bg (#0F0F13) is DARKER than card2 (#141417), so controls placed
        # on a dialog/card2 surface must use ctrl_bg (#252530) which is lighter.
        "input_fg": "#EDEDEF",
        "sec_text": "#8A8A94",
        "border": "#242428",
        "pill_bg": "#141417",
        "pill_fg": "#22D3EE",
        "muted": "#7F7F8D",
        "active_btn": "#061820",
        "task_alt": "#0F0F13",
        # Neutral, decoupled from active_btn's cyan tint (see focus
        # theme's pb_empty comment) — a bit lighter than the near-black
        # original so the track is actually visible against card2.
        "pb_empty": "#1C1C22",
        "link_fg": "#22D3EE",
        "del_hover": "#F87171",
        "note_bg": "#0F0F13",
        "swot_hdr": "#22D3EE",
        "menu_bg": "#141417",
        "menu_hover": "#242428",
        "menu_fg": "#EDEDEF",
        "ctrl_bg": "#252530",    # LIGHTER than card2 — correct contrast direction
        "ctrl_bd": "#3D3D48",    # visible border on dark dialog surface
    },
    "energy": {
        "hdr_gold": "#D02222",   # vivid red header on near-white
        "card2": "#FFFFFF",
        "input_bg": "#F5F5F3",
        "input_fg": "#111111",
        "sec_text": "#6B6B6B",
        "border": "#EBEBEB",
        "pill_bg": "#FFFFFF",
        "pill_fg": "#D02222",
        "muted": "#6F6F6F",
        "active_btn": "#FEE2E2",
        "task_alt": "#FAFAF8",
        # Was the same saturated pink as active_btn — a goal at 1/30
        # rendered with a near-full-width pink block, visually the
        # opposite of "barely started". Neutral gray now; only the
        # filled portion of a bar should carry color.
        "pb_empty": "#EFEBE8",
        "link_fg": "#2563EB",
        "del_hover": "#D02222",
        "note_bg": "#FAFAF8",
        "swot_hdr": "#D02222",
        "menu_bg": "#FFFFFF",
        "menu_hover": "#FEE2E2",
        "menu_fg": "#111111",
        "ctrl_bg": "#F5F5F3",    # control bg on card2 surface (same as input_bg)
        "ctrl_bd": "#DCDCDA",    # border for controls on card2
    },
    "corporate": {
        "hdr_gold": "#AE5009",
        "card2": "#FFFFFF",
        "input_bg": "#F5F1EC",
        "input_fg": "#1C1917",
        "sec_text": "#78716C",
        "border": "#E7E2DB",
        "pill_bg": "#FFFFFF",
        "pill_fg": "#AE5009",
        "muted": "#726B66",
        # #FEF3C7 replaces #FDE68A (amber-400) as active_btn — the old value was
        # too saturated, making the active phase row read as an error highlight
        # rather than a contextual indicator. Lighter amber-100 is consistent
        # with how focus/energy use near-invisible tints for this purpose.
        "active_btn": "#FEF3C7",
        "task_alt": "#FAF8F5",
        # Decoupled from active_btn's amber tint — same reasoning as
        # energy/focus above.
        "pb_empty": "#EFEAE2",
        "link_fg": "#0C4A6E",
        "del_hover": "#D02222",
        "note_bg": "#FAF8F5",
        "swot_hdr": "#AE5009",
        "menu_bg": "#FFFFFF",
        "menu_hover": "#FEF3C7",
        "menu_fg": "#1C1917",
        "ctrl_bg": "#F5F1EC",    # control bg on card2 surface (same as input_bg)
        "ctrl_bd": "#DDD8D2",    # border for controls on card2
    },
    "journey": {
        "hdr_gold": "#4CE0A0",   # bright mint title on dark emerald
        "card2": "#161B19",
        "input_bg": "#121715",
        "input_fg": "#FFFFFF",
        "sec_text": "#9FC2AE",
        "border": "#2A3731",
        "pill_bg": "#161B19",
        "pill_fg": "#4CE0A0",
        "muted": "#6C8A7E",
        "active_btn": "#1E2924",
        "task_alt": "#121715",
        # Decoupled from active_btn's mint-tinted dark green — same
        # reasoning as the other 4 themes' pb_empty above.
        "pb_empty": "#1B211E",
        "link_fg": "#4CE0A0",
        "del_hover": "#F0776B",
        "note_bg": "#121715",
        "swot_hdr": "#4CE0A0",
        "menu_bg": "#161B19",
        "menu_hover": "#2A3731",
        "menu_fg": "#FFFFFF",
        "ctrl_bg": "#1E2924",    # LIGHTER than card2 — correct contrast direction
        "ctrl_bd": "#49836A",    # visible border on dark dialog surface
    },
    "rize": {
        "hdr_gold": "#5255EF",   # soft indigo title on white
        "card2": "#FFFFFF",
        "input_bg": "#FFFFFF",
        "input_fg": "#111827",
        "sec_text": "#6B7280",
        "border": "#E5E7EB",
        "pill_bg": "#FFFFFF",
        "pill_fg": "#5255EF",
        "muted": "#6C7586",
        "active_btn": "#EEF2FF",
        "task_alt": "#FFFFFF",
        "pb_empty": "#E5E7EB",
        "link_fg": "#5255EF",
        "del_hover": "#D02222",
        "note_bg": "#FFFFFF",
        "swot_hdr": "#5255EF",
        "menu_bg": "#FFFFFF",
        "menu_hover": "#F3F4F6",
        "menu_fg": "#111827",
        # ctrl_bg alone keeps the tint: these are small chips (the cadence
        # "7d", "✓ today") whose only definition IS their fill. White
        # on white would leave them invisible until hovered.
        "ctrl_bg": "#F9FAFB",    # control bg on card2 surface (same as input_bg)
        "ctrl_bd": "#D1D5DB",    # border for controls on card2
    },
}

# ── Per-theme card shadow tones — darker than BG, subtle 2px offset ───────────
_SHADOW = {"focus": "#E0DCD5", "warroom": "#000000",
           "energy": "#E7E7E4", "corporate": "#E4DED4", "journey": "#000000",
           "rize": "#E5E7EB"}

# ── Day-phase colours — ONE heat scale, order: (Sleep, Morning, Work, Evening) ─
# Not four unrelated hues but a single cold->hot ramp ordered by how
# demanding the phase is, so the colour itself carries meaning:
# Sleep = coldest (deep blue), Morning = warming (teal), Evening = warm
# (amber), Work = HOTTEST (red, the peak of the day). Kept per-theme
# because one fixed set would look wrong on WAR ROOM's near-black surface.
_SEG_COLORS = {
    #             Sleep(cold)  Morning(warm) Work(HOT/red) Evening(amber)
    "focus": ("#1E3A8A", "#0D9488", "#D02222", "#EA8C1B"),
    "warroom": ("#1E40AF", "#0E7490", "#EF4444", "#F59E0B"),
    "energy": ("#1E3A8A", "#0F766E", "#D02222", "#EA580C"),
    "corporate": ("#1E3A8A", "#0D9488", "#C0392B", "#C96A15"),
    "journey": ("#3B82F6", "#2DD4BF", "#F87171", "#FBBF24"),
    "rize": ("#312E81", "#0D9488", "#D02222", "#A15904"),
}


def _blend(col, toward, t):
    """Mix `col` toward `toward` by t (0..1). Module level on purpose:
    the two tint helpers that did this lived nested inside the Business
    Analysis window, so every other screen that wanted a soft tint had to
    invent its own."""
    c1 = tuple(int(col[i:i + 2], 16) for i in (1, 3, 5))
    c2 = tuple(int(toward[i:i + 2], 16) for i in (1, 3, 5))
    r, g, b = (round(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))
    return "#%02X%02X%02X" % (r, g, b)


def _ink(bg):
    """Readable text colour for text sitting ON a filled accent.

    Every selected tab, pill and primary button in this app was written
    fg="#FFFFFF" on the theme accent. That is right for a deep blue or
    red accent and wrong for a bright one: WAR ROOM's cyan (#22D3EE) and
    JOURNEY's mint (#4CE0A0) put white on a near-white-luminance fill,
    which measured 1.81:1 and 1.68:1 — i.e. the SELECTED state, the one
    the eye goes to first, was the least readable text on the screen in
    both dark themes. Pick the ink from the fill instead of assuming."""
    try:
        r, g, b = (int(bg[i:i + 2], 16) / 255 for i in (1, 3, 5))
    except Exception:
        return "#FFFFFF"

    def _c(v):
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    lum = 0.2126 * _c(r) + 0.7152 * _c(g) + 0.0722 * _c(b)
    # MEASURE both, take the winner — do not guess a lightness cutoff.
    # The first version of this used lum > 0.42, which is well past the
    # real crossover (~0.18): project 2's orange (#F0883E, lum 0.37) sat
    # on the wrong side of it and kept white text at 2.53:1, exactly the
    # bug this function was written to end.
    _ink_dark = "#0B0D0E"
    _ld = 0.2126 * _c(11 / 255) + 0.7152 * _c(13 / 255) + 0.0722 * _c(14 / 255)
    _white = (1.05) / (lum + 0.05)
    _dark = (max(lum, _ld) + 0.05) / (min(lum, _ld) + 0.05)
    return "#FFFFFF" if _white >= _dark else _ink_dark


def _style_sb(sb, surface, thumb):
    """Paint a tk.Scrollbar so it belongs to the theme.

    Tk's Scrollbar ships with a hard-coded #d9d9d9 trough and a raised
    3D border. Every scrollbar in this app was left at that default, so
    on WAR ROOM and JOURNEY (near-black surfaces) each scroll region was
    edged with a bright Windows-95 grey slab — the single loudest thing
    on the screen, attached to the one control that carries no meaning.
    `surface` is the colour the bar sits on, `thumb` the handle."""
    try:
        sb.configure(bg=thumb, troughcolor=surface,
                     activebackground=_blend(thumb, "#FFFFFF", 0.25),
                     bd=0, relief="flat", highlightthickness=0,
                     elementborderwidth=0, width=8)
    except Exception:
        pass
    return sb


def _heat(col, frac, cold="#FFFFFF"):
    """Blend `col` toward `cold` for low values — heatmap intensity.

    A heatmap encodes magnitude as colour strength, so a bar that is 5%
    through its phase should read pale and one that is 95% through should
    read saturated. Without this every bar sits at full strength the
    moment it starts, which loses exactly the information a heatmap is
    for. Floor of 0.35 keeps a just-started bar visible rather than
    washing it out to the background."""
    t = 0.35 + 0.65 * max(0.0, min(1.0, frac))
    c1 = tuple(int(cold[i:i + 2], 16) for i in (1, 3, 5))
    c2 = tuple(int(col[i:i + 2], 16) for i in (1, 3, 5))
    r, g, b = (round(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))
    return f"#{r:02X}{g:02X}{b:02X}"


_SEG_LABELS_EN = ["Sleep", "Morning", "Work", "Evening"]
_SEG_LABELS_BN = ["ঘুম", "সকাল", "কাজ", "সন্ধ্যা"]
_PHASE_BAR_H = 13     # px — spec calls for 12-14px bars (was 7)

# ── Clock geometry — ONE source of truth ─────────────────────────────────────
# Every clock dimension is derived from _CLOCK_SZ via _CLOCK_K so the face
# can be resized in one place. Previously 200 was hard-coded separately in
# the canvas constructor, _draw_clock_face AND _update_clock, so changing
# the canvas size silently drew the face off-centre (that actually
# happened when it was briefly set to 170).
_CLOCK_SZ = 130          # analog face box (was 140) — the clock is glanced
# at for seconds a day; the task list is used all
# day, so screen real estate is shifted to it.
_CLOCK_K = _CLOCK_SZ / 200.0        # scale factor for every derived size


def _ck(v):
    """Scale an original-200px measurement to the current clock size."""
    return v * _CLOCK_K


# Unified clock-card layout. Clock + digital time + date are drawn as
# items on ONE canvas rather than as three stacked widgets, because a
# rounded card with a shadow is only achievable on a Canvas — Tk widgets
# have square corners, full stop. Drawing them together also lets the
# three elements share one padding box and be centred as a group.
_CARD_PAD = 14   # padding inside the card
_CARD_RADIUS = 12
_GAP_CLOCK_TIME = 6   # clock -> time
_GAP_TIME_SEC = 2   # time -> seconds line (6 made the seconds hang low)
_GAP_SEC_DATE = 6   # seconds -> date
_DATE_LINE_H = 18
_PHASE_ROW_GAP = 9   # between phase rows (was SP4=16; ~28px row pitch -> ~20)
_PANEL3_W = 545      # clock panel fixed width (was 520, +25 breathing room)
_PANEL_GAP = 7       # gap each side of a panel divider (spec 6-8px)
# Floor, not just a default, for the "full" layout's total window width.
# A "full_width" saved from BEFORE the 67:83:50 panel split (e.g. an old
# drag-resize, or a stale 1400-era default) could otherwise persist as a
# small number forever and starve panel 1 down to a sliver no matter how
# generous the ratio is — max() at every read site guarantees panel 1
# always gets real room without overriding a width the user chose that's
# already wider than this.
_FULL_W_FLOOR = 1600

_PB_RAMPS = {
    "focus": ["#BFDBFE", "#93C5FD", "#60A5FA", "#3B82F6", "#2960E6",
              "#2D5DD4", "#1E40AF", "#1E3A8A"],
    "warroom": ["#A5F3FC", "#67E8F9", "#22D3EE", "#06B6D4", "#0891B2",
                "#0E7490", "#155E75", "#164E63"],
    "energy": ["#FDE047", "#FACC15", "#FB923C", "#F97316", "#EF4444",
               "#D02222", "#B91C1C", "#991B1B"],
    "corporate": ["#FDE68A", "#FCD34D", "#FBBF24", "#F59E0B", "#A15904",
                  "#AE5009", "#92400E", "#78350F"],
    "journey": ["#CFF9E4", "#A8F2CE", "#7EEAB8", "#4CE0A0", "#38B384",
                "#49836A", "#2A3731", "#17211D"],
    "rize": ["#C7D2FE", "#A5B4FC", "#818CF8", "#5255EF", "#4F46E5",
             "#4338CA", "#3730A3", "#312E81"],
}

# ── Daily discipline habits ──────────────────────────────────────────────────
# ONE source of truth, shared by the Life Execution Dashboard window and by
# PLAN's Discipline tab. They read and write the same _habit_data entries, so
# a habit ticked in one place is ticked in the other; keeping two private
# copies of these lists would have let the two views drift into disagreeing
# about what the habits even are.
_HABIT_CATS = [("MONEY", "money"), ("HEALTH", "health"),
               ("RELATION", "relation"), ("MINDSET", "mind")]

_HABIT_DEFAULTS = {
    "money": ["Review finances", "Work on income", "Track expenses",
              "Learn business skill", "Network"],
    "health": ["Exercise 30min", "Sleep 7-8h", "Drink 2L water",
               "Healthy meal", "No junk food"],
    "relation": ["Family time", "Help someone", "Gratitude",
                 "No negative talk", "Mentor/learn"],
    "mind": ["Read 30min", "Meditate 10min", "Journal",
             "Learn new thing", "No social media 1h"],
}

# ── Bangla ────────────────────────────────────────────────────────────────────
BN_DAYS = ["সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার", "রবিবার"]
EN_MONTHS = ["January", "February", "March", "April", "May", "June",
             "July", "August", "September", "October", "November", "December"]


def ordinal(n):
    if 11 <= n <= 13:
        return f"{n}th"
    return f"{n}{['th', 'st', 'nd', 'rd', 'th'][min(n % 10, 4)]}"


def fmt_ms(s):
    ms = int((s % 1) * 100)
    s = int(s)
    return f"{s // 3600:02d}:{(s % 3600) // 60:02d}:{s % 60:02d}.{ms:02d}"


def fmt_ms_parts(s):
    """Same value as fmt_ms, split into (HH:MM:SS, .hundredths) so the
    hundredths can be styled smaller/quieter than the seconds that
    actually matter — full-size bold hundredths digits update 100x a
    second and read as noise, not information."""
    ms = int((s % 1) * 100)
    s = int(s)
    return (f"{s // 3600:02d}:{(s % 3600) // 60:02d}:{s % 60:02d}",
            f".{ms:02d}")


def fmt(s):
    s = int(s)
    return f"{s // 3600:02d}:{(s % 3600) // 60:02d}:{s % 60:02d}"


def _ramp_interp(colors, n):
    """Linearly interpolate a short list of hex colors into `n` smooth
    steps. Used to turn the progress bar's ~8-color ramp into a
    continuous-looking gradient instead of visibly blocky bands — with
    only 8 wide rectangles, a partially-filled bar (e.g. 12% done) shows
    just 1-2 chunky, high-contrast segments, which reads as a jumpy
    "traffic light" rather than a smooth fill."""
    if n <= 1 or len(colors) < 2:
        return list(colors)
    rgbs = [tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) for c in colors]
    segs = len(rgbs) - 1
    out = []
    for i in range(n):
        t = i / (n - 1) * segs
        lo = min(int(t), segs - 1)
        frac = t - lo
        r = round(rgbs[lo][0] + (rgbs[lo + 1][0] - rgbs[lo][0]) * frac)
        g = round(rgbs[lo][1] + (rgbs[lo + 1][1] - rgbs[lo][1]) * frac)
        b = round(rgbs[lo][2] + (rgbs[lo + 1][2] - rgbs[lo][2]) * frac)
        out.append(f"#{r:02X}{g:02X}{b:02X}")
    return out


def fmt_datetime(ts):
    dt = datetime.fromtimestamp(ts)
    return dt.strftime("%#m/%#d/%Y, %#I:%M:%S %p") if os.name == "nt" \
        else dt.strftime("%-m/%-d/%Y, %-I:%M:%S %p")


def day_number(start_date_str):
    try:
        return (date.today() - date.fromisoformat(start_date_str)).days + 1
    except Exception:
        return 1


FIVE_HOURS = 5 * 3600   # seconds — default goal (Settings can override)
APP_VERSION = "3.2.0"
APP_CONTACT = "balakaint@gmail.com"

# ─────────────────────────────────────────────────────────────────────────────


class TaskTrackerApp(tk.Tk):
    def __init__(self):
        super().__init__()
        # Hidden until fully built — see the matching deiconify() at the
        # end of __init__. Without this, the window is shown on screen
        # (in the OS's default light title bar) BEFORE self._mode is even
        # read, so by the time _set_dark_titlebar() runs the title bar
        # has already painted once as light; SetWindowPos/FRAMECHANGED
        # asks Windows to repaint it but that didn't reliably happen
        # until some unrelated redraw (e.g. clicking PLAN/FOCUS) forced
        # one. Never showing the light version in the first place avoids
        # depending on that repaint happening at all.
        self.withdraw()
        self.title("Task Tracker  ·  v3 — 5 Themes")
        self.geometry("760x900+20+20")
        self.resizable(True, True)
        self._set_app_icon()

        d = load_data()
        self.tasks = d.get("tasks", [])
        self.tasks_focus = d.get("tasks_focus", [])
        # Repair duplicate task ids. Ids are millisecond timestamps
        # (int(time.time()*1000)) — two tasks added within the same
        # millisecond, or any manual/imported data, can collide. A
        # collision is silent corruption: _find_task(tid) always
        # returns the FIRST task carrying that id, so clicking the
        # checkbox/timer/star on a LATER task sharing the id actually
        # mutates the earlier one instead — exactly the "I pressed done
        # on task A and task B changed" symptom. Fixed once at load by
        # reassigning fresh unique ids to every duplicate after the
        # first occurrence, across both lists combined.
        _seen_ids = set()
        for _t in self.tasks + self.tasks_focus:
            _tid = _t.get("id")
            if _tid is None or _tid in _seen_ids:
                _new_id = int(time.time() * 1000)
                while _new_id in _seen_ids:
                    _new_id += 1
                _t["id"] = _new_id
            _seen_ids.add(_t["id"])
        self.work_secs = float(d.get("work_secs", 0))
        # ── Goals, per project ────────────────────────────────────────────
        # Everything written before this build kept ONE set of goals for
        # the whole app. Those goals are not thrown away and they are not
        # duplicated across all six slots: they move to Project 1, which
        # is where they were actually about. Migration runs once — after
        # the first save the file carries goals_by_project and this
        # branch never fires again.
        _gbp = d.get("goals_by_project")
        if not isinstance(_gbp, dict):
            _gbp = {}
        _gbp = {_k: {_t: list(_v.get(_t, []) or [])
                     for _t in GOAL_TYPES}
                for _k, _v in _gbp.items() if isinstance(_v, dict)}
        if not _gbp:
            _legacy = {_t: list(d.get(_t, []) or []) for _t in GOAL_TYPES}
            if any(_legacy.values()):
                _gbp = {"proj1": _legacy}
        self._goals_by_project = _gbp
        self._goal_project = d.get("goal_project") or "proj1"
        self._bind_goal_lists()
        self.start_date = d.get("start_date", str(date.today()))
        self.progress_date = d.get("progress_date", str(date.today()))
        self.progress_secs = float(d.get("progress_secs", 0))
        self.focus_progress_secs = float(d.get("focus_progress_secs", 0))
        self.vision_data = d.get("vision_data", {})
        # Ensure all 6 project keys exist (won't overwrite existing data)
        for _k in ["proj1", "proj2", "proj3", "proj4", "proj5", "proj6"]:
            self.vision_data.setdefault(_k, {"title": "", "note": "", "tasks": []})
            # ensure 12 analysis boxes exist
            vd_k = self.vision_data[_k]
            for _bi in range(12):
                vd_k.setdefault(f"box{_bi}_title", "")
                vd_k.setdefault(f"box{_bi}_text", "")
        self._mind_note = self.vision_data.get("_mind_note", "")
        # Restore saved text fields into vision_data for UI to pick up
        if not self.vision_data.get("_mind_note") and d.get("mind_note"):
            self.vision_data["_mind_note"] = d.get("mind_note", "")
            self._mind_note = self.vision_data["_mind_note"]
        if not self.vision_data.get("_opp_note") and d.get("opp_note"):
            self.vision_data["_opp_note"] = d.get("opp_note", "")
        if not self.vision_data.get("_idea_note") and d.get("idea_note"):
            self.vision_data["_idea_note"] = d.get("idea_note", "")
        if not self.vision_data.get("_mind_title") and d.get("mind_title"):
            self.vision_data["_mind_title"] = d.get("mind_title", "")
        if not self.vision_data.get("_opp_title") and d.get("opp_title"):
            self.vision_data["_opp_title"] = d.get("opp_title", "")
        if not self.vision_data.get("_task_title") and d.get("task_title"):
            self.vision_data["_task_title"] = d.get("task_title", "")
        if not self.vision_data.get("_sec_title_yearly") and d.get("sec_title_yearly"):
            self.vision_data["_sec_title_yearly"] = d.get("sec_title_yearly", "")
        if not self.vision_data.get("_sec_title_monthly") and d.get("sec_title_monthly"):
            self.vision_data["_sec_title_monthly"] = d.get("sec_title_monthly", "")
        if not self.vision_data.get("_sec_title_weekly") and d.get("sec_title_weekly"):
            self.vision_data["_sec_title_weekly"] = d.get("sec_title_weekly", "")
        if not self.vision_data.get("_motto_text") and d.get("motto_text"):
            self.vision_data["_motto_text"] = d.get("motto_text", "")
        if not self.vision_data.get("_work_motto_text") and d.get("work_motto_text"):
            self.vision_data["_work_motto_text"] = d.get("work_motto_text", "")
        # Restore Business Development Plan data
        if d.get("bdp_data") and not self.vision_data.get("self_dev"):
            self.vision_data["self_dev"] = d["bdp_data"]
        elif d.get("bdp_data"):
            # Merge — bdp_data is authoritative
            self.vision_data["self_dev"].update(d["bdp_data"])
        self.work_running = False
        self.task_timers = {}
        # Which project's clock is running (one at a time, or None), and
        # the per-card widgets _tick updates each second. Never restored
        # as running on launch: the app being closed with a timer going
        # is not evidence you're still working.
        self._proj_running = None
        self._proj_time_lbls = {}
        # The live session behind _proj_running: how much it has banked
        # so far, and whether the app started it (window opened) or the
        # user did. Never restored from disk — see _proj_running above.
        self._proj_session = None
        self._save_ctr = 0
        self._expanded = {}
        self._music_file = None
        self._music_proc = None
        self._mode = d.get("theme", "focus")
        # NOT called here. The log proved why: GetParent(winfo_id())
        # returns 0 while the window is still withdrawn/unrealized, so we
        # were silently falling back to winfo_id() itself — which is
        # Tk's inner CONTENT window, not the outer OS frame that actually
        # owns the title bar. Setting the attribute on the wrong window
        # succeeds (DWM returns S_OK) but visibly does nothing, which is
        # exactly what was reported. GetParent only resolves to the real
        # frame once the window has been mapped — see the deiconify()
        # block at the end of __init__, which calls this for real.
        self._onboarded = bool(d.get("onboarded", False))
        # PLAN no longer shows a task list at all (it shows the Mindset /
        # Discipline / Consistency review tabs), so FOCUS is now the only
        # list that is ever built.
        self._active_task_list = "focus"
        # Task list day filter. Always starts on "today" — waking up in
        # tomorrow-planning mode would hide the work you actually have to
        # do right now, and yesterday's "tomorrow" IS today by then.
        self._task_day = "today"
        self._task_filter = {"classic": "", "focus": ""}
        self._last_deleted = (None, None, None)
        # Undo history for this session only — deliberately not saved.
        # The entries are closures over live task objects, which can't be
        # serialised; and a freshly-opened app should start from what is
        # on disk rather than offering to reverse something you did days
        # ago and have long since forgotten.
        self._undo_stack = []
        # pid -> callable(done: bool) that reticks one project card's
        # task row in place. Rebuilt every time the cards are, and read
        # defensively, so a stale entry from a destroyed card is a
        # no-op rather than a crash.
        self._proj_task_sync = {}
        # Which TODAY EXECUTION blocks the user has manually opened this
        # session. Runtime only, so every launch starts from the
        # automatic "only the block you're in" state — see _build_exec_plan.
        self._exec_open = {}
        # Which task the right panel is pointed at. Runtime only — see
        # _now_task() for why this is derived rather than saved. On a
        # restart or a crash it simply re-derives, and no clock resumes
        # by itself: the elapsed seconds are already banked on the task,
        # but whether you were actually working is not something the app
        # can know after the fact.
        self._now_id = None
        # Pomodoro engine state (FOCUS view)
        self._pomo = {"mode": "focus", "remain": 25 * 60, "running": False,
                      "n": 0, "task": None}
        _sp = d.get("pomo", {}) or {}
        try:
            _mode = _sp.get("mode", "focus")
            _remain = float(_sp.get("remain", self.POMO_DUR.get(_mode, 1500)))
            if _sp.get("running") and _sp.get("saved_at"):
                _elapsed = max(0.0, time.time() - float(_sp["saved_at"]))
                _remain = max(0.0, _remain - _elapsed)
            _tid = _sp.get("task")
            self._pomo = {"mode": _mode if _mode in self.POMO_DUR else "focus",
                          "remain": _remain, "running": False,   # never auto-resume
                          "n": int(_sp.get("n", 0)), "task": _tid}
        except Exception as _e:
            log.debug("pomo restore: %s", _e)

        # ── Repair sessions orphaned by a crash / power loss ─────────────────
        # A running session is {"start": t, "end": None}. on_close closes
        # those, but a hard kill can't, and task_timers isn't persisted —
        # so nothing would ever close them. pomo.saved_at (written every
        # save) is the best evidence of how long the app was alive, so it
        # becomes the end, never earlier than the start.
        try:
            _last_alive = float(_sp.get("saved_at") or 0) or None
            _fixed = 0
            for _t in self.tasks + self.tasks_focus:
                for _s in _t.get("sessions", []):
                    if _s.get("end") is None and _s.get("start"):
                        _s["end"] = max(float(_s["start"]),
                                        _last_alive or float(_s["start"]))
                        _fixed += 1
            if _fixed:
                log.info("closed %d session(s) orphaned by an unclean exit", _fixed)
        except Exception as _e:
            log.debug("orphan session repair: %s", _e)

        if self._mode not in THEME_ORDER:
            self._mode = "focus"
        self._detail_geometries = d.get("detail_geometry", {})
        self._habit_data = d.get("habit_data", {})
        self._daily_history = d.get("daily_history", {}) or {}
        self._settings = {"lang": "en", "currency": "$",
                          "work_start": 9, "work_end": 24,
                          "goal_hours": 5, "goal_hours_focus": 5}
        self._settings.update(d.get("settings", {}) or {})
        self._last_review = d.get("last_review", "")

        # ── One-time migration: PLAN's task list → FOCUS ─────────────────────
        # PLAN used to own its own task list; it now owns the Mindset /
        # Discipline / Consistency review tabs instead, so anything still
        # sitting in self.tasks would simply be invisible — and invisible
        # tasks carrying recorded timer sessions are exactly the kind of
        # silent data loss this app has been bitten by before. Move them
        # once, ids/sessions/day intact, and record that it happened so a
        # later restart can't duplicate them. self.tasks stays as a (now
        # empty) list because save_data, _find_task and _record_today all
        # still read it. Must sit AFTER _settings is populated — reading
        # the flag any earlier is an AttributeError on a cold start.
        if not self._settings.get("plan_tasks_migrated"):
            if self.tasks:
                _existing = {t.get("id") for t in self.tasks_focus}
                for _t in self.tasks:
                    if _t.get("id") not in _existing:
                        self.tasks_focus.append(_t)
                log.info("moved %d PLAN task(s) to FOCUS", len(self.tasks))
                self.tasks = []
            self._settings["plan_tasks_migrated"] = True
            # PLAN no longer has a task list, so landing on it after the
            # migration would look like the tasks vanished. Open on FOCUS
            # once so the moved tasks are the first thing seen.
            self._settings["panel3_view"] = "focus"

        # ── One-time reset of the four task-list headings ────────────────────
        # These headings are editable Entry fields that persist on
        # FocusOut, so they accumulated saved values — including old
        # defaults frozen in by a stray click — which then permanently
        # shadowed the new TARGETS / STRIKE LIST defaults. Clearing them
        # once lets the new defaults through; the flag means a heading
        # the user types AFTER this runs is never touched again.
        # Must sit AFTER _settings is populated above — reading the flag
        # any earlier is an AttributeError on a cold start.
        if not self._settings.get("_headings_reset_v2"):
            for _k in ("_task_title", "_task_title_tomorrow",
                       "_task_title_focus", "_task_title_focus_tomorrow"):
                self.vision_data.pop(_k, None)
            self._settings["_headings_reset_v2"] = True

        # ── One-time purge of the removed Daily Planner's data ───────────────
        # The planner feature is gone (Life OS covers it), leaving its
        # __dp2_<date> entries orphaned in _habit_data. Removing them at
        # the user's request — but written out to a dated file beside the
        # main store first. Deleting code is reversible from git; deleting
        # someone's writing is not, and "the feature no longer exists" is
        # a poor reason to lose it irrecoverably.
        if not self._settings.get("_dp_purged"):
            _dp_keys = [k for k in self._habit_data
                        if str(k).startswith("__dp2_")]
            if _dp_keys:
                try:
                    _dump = os.path.join(
                        os.path.dirname(DATA_FILE),
                        "task_tracker_daily_planner_archive.json")
                    with open(_dump, "w", encoding="utf-8") as _fh:
                        json.dump({k: self._habit_data[k] for k in _dp_keys},
                                  _fh, indent=2, ensure_ascii=False)
                    log.info("archived %d planner day(s) to %s",
                             len(_dp_keys), _dump)
                except Exception as _e:
                    log.warning("planner archive failed, keeping data: %s", _e)
                    _dp_keys = []      # no archive == no delete
                for _k in _dp_keys:
                    self._habit_data.pop(_k, None)
            self._settings["_dp_purged"] = True

        # Progressive panel layout — "compact" (task list only, sidebar-
        # widget style) is ALWAYS the layout the app opens with, every
        # launch, regardless of whatever layout was open when the app was
        # last closed. Two on-screen arrow buttons step through
        # compact -> partial -> full during the session; Ctrl+F jumps
        # straight between compact and full. The layout itself is not
        # persisted across restarts (only the user's preferred "full"
        # width is, via full_width below) — every fresh open should be
        # the minimal, least-distracting single-panel view.
        self._panel_layout = "compact"
        # (widths live in _layout_width() — there used to be a second
        #  table here whose "full" meant the saved full_width while the
        #  runtime one meant the whole work area, so the width you got on
        #  launch and the width you got from the arrow disagreed)

        # Restore main window geometry and maximized state.
        # Panel 3 must ALWAYS dock to the right edge at full monitor
        # height, from the very first frame — so startup geometry is
        # computed with the exact same deterministic, screen-size-only
        # formula as every runtime arrow-click (self._dock_geometry).
        # A saved X/width from a previous session (possibly a different
        # layout, or from before this docking system existed) is
        # intentionally NOT reused for X — that mismatch was the root
        # cause of the window landing away from the right edge on
        # launch. Only "zoomed" is honored as a saved state; everything
        # else re-docks fresh.
        saved_geo = d.get("main_geometry", "")
        _fallback_geo = self._dock_geometry(self._layout_width())

        if saved_geo == "zoomed":
            try:
                self.state("zoomed")
            except Exception:
                self.geometry(_fallback_geo)
        else:
            self.geometry(_fallback_geo)
        self._last_geometry = self.geometry()   # seed it now — don't wait
        # for the first <Configure>

        # The title-bar height can only be MEASURED once the window is
        # actually on screen (_frame_overhead falls back to a default
        # before that), so re-dock once after the first idle cycle. On a
        # display where the default was already right this is a no-op.
        def _redock_once():
            try:
                if self.state() != "zoomed":
                    self.geometry(self._dock_geometry(self._layout_width()))
            except Exception as _e:
                log.debug("initial re-dock: %s", _e)
        self.after_idle(_redock_once)

        # Save geometry whenever window is moved or resized
        def _save_main_geo(e=None):
            # only save if it's the main window (not child widgets)
            try:
                if e and e.widget is not self:
                    return
                geo = self.winfo_geometry()
                if geo and geo != "1x1+0+0":
                    self._last_geometry = geo
                    # (full_width used to be captured here so re-expanding
                    #  could restore it. Nothing reads it any more — "full"
                    #  is the work area by definition — and a setting that
                    #  is written and never read only misleads the next
                    #  person to open this file.)
            except Exception:
                pass
        self.bind("<Configure>", _save_main_geo)

        # Reset progress bar if it's a new day (cold start — app was
        # closed before midnight, reopened this morning). Goes through
        # the same _rollover_day() as _tick's while-running check —
        # see that method's docstring for why they used to be two
        # different, out-of-sync resets.
        if self.progress_date != str(date.today()):
            self._rollover_day()

        self._build_ui()
        self._tick()
        self._bind_focus_ring()
        self._bind_global_scroll()
        self._bind_keyboard_nav()
        self._bind_context_menu()
        if not self._onboarded:
            self.after(600, self._show_onboarding)
        else:
            self.after(2500, self._maybe_mit_prompt)

        # Reveal the window now that it's fully built.
        self.deiconify()

        # THE actual fix, found from the diagnostic log: GetParent(hwnd)
        # returns 0 while the window is still withdrawn/unrealized, so
        # earlier attempts silently applied the DWM attribute to Tk's
        # inner content window instead of the real OS frame — it
        # "succeeded" (S_OK) but had nothing to visibly do. GetParent
        # only resolves to the correct frame once the window has
        # actually been mapped on screen, which deiconify() above just
        # did — so NOW is the first point where this can work at all.
        # update_idletasks() forces Tk to finish that mapping before we
        # ask Windows for the handle.
        if os.name == "nt":
            def _apply_titlebar_now(attempts_left=15):
                self.update_idletasks()
                try:
                    import ctypes
                    hwnd_ready = bool(
                        ctypes.windll.user32.GetParent(self.winfo_id()))
                except Exception:
                    hwnd_ready = False
                if not hwnd_ready and attempts_left > 0:
                    # GetParent still returns 0 — the OS frame isn't
                    # resolvable yet. Keep polling rather than guessing a
                    # fixed delay; how long this takes varies by machine.
                    self.after(150, lambda: _apply_titlebar_now(attempts_left - 1))
                    return
                self._set_dark_titlebar(
                    self, self._mode in ("warroom", "journey"))
            self.after(100, _apply_titlebar_now)

    # ── Global mouse-wheel scroll dispatcher ─────────────────────────────────
    # Rule: if mouse is over a Text widget → let that Text scroll itself
    #       if mouse is over anything else → find nearest Canvas and scroll it
    def _bind_focus_ring(self):
        """Give every Button/Entry/Checkbutton a visible keyboard-focus state.

        Almost every control in this app is built with
        `relief="flat", bd=0, highlightthickness=0` — which also removes
        Tk's focus ring, so tabbing through the window moved the focus
        with nothing on screen changing. That is the one accessibility
        failure a keyboard user cannot work around.

        The indicator is a background/foreground swap rather than a ring,
        deliberately: turning highlightthickness back on would add 4px to
        every control's requested size, and this UI is a fixed-width
        panel where several rows are already within a few pixels of their
        budget. A colour swap is a visible focus indicator and moves
        nothing.

        Bound at CLASS level, so it covers controls that do not exist yet
        (every theme switch destroys and rebuilds the whole tree)."""
        def _on_in(e):
            w = e.widget
            try:
                if w._fr_saved is not None:      # already focused
                    return
            except AttributeError:
                pass
            try:
                w._fr_saved = (w.cget("bg"), w.cget("fg"))
                w.configure(bg=_blend(w.cget("bg"), self.T("GREEN"), 0.30),
                            fg=self.T("GREEN"))
            except Exception:
                w._fr_saved = None

        def _on_out(e):
            w = e.widget
            saved = getattr(w, "_fr_saved", None)
            w._fr_saved = None
            if not saved:
                return
            try:
                w.configure(bg=saved[0], fg=saved[1])
            except Exception:
                pass

        for _cls in ("Button", "Entry", "Checkbutton", "Radiobutton"):
            self.bind_class(_cls, "<FocusIn>", _on_in, add="+")
            self.bind_class(_cls, "<FocusOut>", _on_out, add="+")

    def _bind_global_scroll(self):
        """Bind global mouse-wheel scroll across all canvases."""

        def _find_scrollable_canvas(widget):
            """Walk up parent chain to find a Canvas with yscrollcommand set."""
            w = widget
            while w:
                if isinstance(w, tk.Canvas):
                    try:
                        if w.cget("yscrollcommand"):
                            return w
                    except Exception:
                        pass
                try:
                    w = w.master
                except Exception:
                    break
            return None

        def _widget_under_pointer(event):
            """Return the actual widget under the mouse pointer right now.
            Using winfo_containing means scroll works WITHOUT clicking first —
            event.widget alone fails before the window has keyboard focus."""
            try:
                w = self.winfo_containing(event.x_root, event.y_root)
                return w if w is not None else event.widget
            except Exception:
                return event.widget

        def _on_mousewheel(event):
            widget = _widget_under_pointer(event)
            # If pointer is over a Text widget that can scroll, let it scroll itself
            if isinstance(widget, tk.Text):
                try:
                    # only hand off if the Text is actually scrollable
                    if widget.yview() != (0.0, 1.0):
                        widget.yview_scroll(int(-1 * (event.delta / 120)), "units")
                        return "break"
                except Exception:
                    pass
            # Otherwise find the parent canvas and scroll it smoothly
            canvas = _find_scrollable_canvas(widget)
            if canvas:
                steps = int(-1 * (event.delta / 120))
                for _ in range(abs(steps)):
                    canvas.yview_scroll(2 if steps > 0 else -2, "units")
                return "break"

        # Linux scroll events
        def _on_scroll_up(event):
            widget = _widget_under_pointer(event)
            if isinstance(widget, tk.Text):
                try:
                    if widget.yview() != (0.0, 1.0):
                        widget.yview_scroll(-1, "units")
                        return "break"
                except Exception:
                    pass
            canvas = _find_scrollable_canvas(widget)
            if canvas:
                canvas.yview_scroll(-2, "units")
                return "break"

        def _on_scroll_down(event):
            widget = _widget_under_pointer(event)
            if isinstance(widget, tk.Text):
                try:
                    if widget.yview() != (0.0, 1.0):
                        widget.yview_scroll(1, "units")
                        return "break"
                except Exception:
                    pass
            canvas = _find_scrollable_canvas(widget)
            if canvas:
                canvas.yview_scroll(2, "units")
                return "break"

        self.bind_all("<MouseWheel>", _on_mousewheel)
        self.bind_all("<Button-4>", _on_scroll_up)
        self.bind_all("<Button-5>", _on_scroll_down)

    # ── Right-click copy/paste menu (global) ─────────────────────────────────
    def _bind_context_menu(self):
        """Attach Cut/Copy/Paste/Select-All right-click menu to all text widgets."""
        def _show_menu(event):
            w = event.widget
            if not isinstance(w, (tk.Text, tk.Entry)):
                return
            try:
                w.focus_set()
            except Exception:
                pass

            m = tk.Menu(self, tearoff=0)
            try:
                has_sel = bool(w.tag_ranges("sel")) if isinstance(w, tk.Text) \
                    else bool(w.selection_present())
            except Exception:
                has_sel = False

            def _do(action):
                try:
                    if action == "cut":
                        w.event_generate("<<Cut>>")
                    elif action == "copy":
                        w.event_generate("<<Copy>>")
                    elif action == "paste":
                        w.event_generate("<<Paste>>")
                    elif action == "selectall":
                        if isinstance(w, tk.Text):
                            w.tag_add("sel", "1.0", "end-1c")
                        else:
                            w.select_range(0, "end")
                except Exception as _e:
                    log.debug("ctx menu action: %s", _e)

            m.add_command(label="Cut", accelerator="Ctrl+X",
                          state=("normal" if has_sel else "disabled"),
                          command=lambda: _do("cut"))
            m.add_command(label="Copy", accelerator="Ctrl+C",
                          state=("normal" if has_sel else "disabled"),
                          command=lambda: _do("copy"))
            m.add_command(label="Paste", accelerator="Ctrl+V",
                          command=lambda: _do("paste"))
            m.add_separator()
            m.add_command(label="Select All", accelerator="Ctrl+A",
                          command=lambda: _do("selectall"))
            try:
                m.tk_popup(event.x_root, event.y_root)
            finally:
                m.grab_release()
            return "break"

        self.bind_all("<Button-3>", _show_menu)

        def _select_all(event):
            w = event.widget
            try:
                if isinstance(w, tk.Text):
                    w.tag_add("sel", "1.0", "end-1c")
                    return "break"
                elif isinstance(w, tk.Entry):
                    w.select_range(0, "end")
                    return "break"
            except Exception as _e:
                log.debug("select all: %s", _e)
        self.bind_all("<Control-a>", _select_all)
        self.bind_all("<Control-A>", _select_all)

    # ── Global keyboard shortcuts ─────────────────────────────────────────────
    def _bind_keyboard_nav(self):
        """Bind app-wide keyboard shortcuts (called once at startup)."""
        self.bind_all("<Control-s>", lambda e: (save_data(self), None))

        def _ctrl_t(e=None):
            log.debug("Ctrl+T fired, switching theme from %s", self._mode)
            self._toggle_mode()
            return "break"
        self.bind_all("<Control-t>", _ctrl_t)
        self.bind_all("<Control-T>", _ctrl_t)  # Shift/CapsLock variant
        # Tk's Entry/Text widgets have a BUILT-IN Control-t binding
        # ("transpose-chars", swaps the two characters around the
        # cursor) registered at the widget-class level, which fires
        # before bind_all — so with focus in any text field (which is
        # most of the time) Ctrl+T silently transposed characters
        # instead of switching themes. Overriding the class bindings
        # directly (same event, no add="+") replaces that default.
        self.bind_class("Entry", "<Control-t>", _ctrl_t)
        self.bind_class("Entry", "<Control-T>", _ctrl_t)
        self.bind_class("Text", "<Control-t>", _ctrl_t)
        self.bind_class("Text", "<Control-T>", _ctrl_t)

        # Belt-and-suspenders fallback: a raw KeyPress catch-all in
        # case some widget/platform combo still swallows the named
        # <Control-t> binding before it reaches here (e.g. a widget
        # class we haven't overridden, like a ttk entry). This checks
        # the Control modifier bit directly instead of relying on Tk's
        # named-sequence matching. Bound with add="+" exactly ONCE —
        # this whole method re-runs after every theme switch, so an
        # unguarded add="+" bind here would re-stack itself each time
        # and fire N times per keypress after N switches.
        if not getattr(self, "_kb_fallback_bound", False):
            def _key_fallback(e):
                if (e.state & 0x4) and e.keysym.lower() == "t":
                    self._toggle_mode()
                    return "break"
                return None
            self.bind_all("<KeyPress>", _key_fallback, add="+")
            self._kb_fallback_bound = True
        self.bind_all("<Control-w>", lambda e: self._handle_escape(e))
        self.bind_all("<Control-f>", lambda e: self._toggle_focus_mode())
        # Ctrl+Z — undoes the last task action anywhere in the app. The
        # handler returns None (not "break") when focus is in a text
        # field, which lets the keystroke fall through to that widget's
        # own editing behaviour instead of yanking a task change out
        # from under someone who just meant to un-type a word.
        self.bind_all("<Control-z>", self._undo_last)
        self.bind_all("<Control-Z>", self._undo_last)
        self.bind_all("<F1>", lambda e: self._show_shortcuts_panel())
        self.bind_all("<question>", self._maybe_show_shortcuts)

    def _maybe_show_shortcuts(self, event=None):
        """Open shortcuts panel on '?' — but never while typing in a field."""
        w = event.widget if event else None
        if isinstance(w, (tk.Entry, tk.Text)):
            return   # let the user type '?' normally
        self._show_shortcuts_panel()

    # Right-click dark mode removed

    # ── Branding — custom icon + Windows dark title bar ───────────────────────
    def _set_app_icon(self):
        """Load app_icon.ico (shipped beside the script) as the window/
        taskbar icon. Windows-only format, but iconbitmap silently no-ops
        on other platforms rather than raising, so this is safe everywhere.
        `default=True` also applies it to every Toplevel opened later
        (detail windows, Project Journey, Business Plan Notes, etc.) so
        none of them fall back to Tk's default feather icon."""
        try:
            if hasattr(sys, "_MEIPASS"):
                base_dir = sys._MEIPASS   # PyInstaller onefile extraction dir
            elif getattr(sys, "frozen", False):
                base_dir = os.path.dirname(os.path.abspath(sys.argv[0]))
            else:
                base_dir = os.path.dirname(os.path.abspath(__file__))
            icon_path = os.path.join(base_dir, "app_icon.ico")
            if os.path.exists(icon_path):
                self.iconbitmap(default=icon_path)
        except Exception as _e:
            log.debug("app icon: %s", _e)

    def _set_dark_titlebar(self, win, dark):
        """Toggle the Windows 10/11 dark title bar via DWM. Best-effort:
        older Windows builds, Wine, or a locked-down dwmapi simply fail
        the ctypes call, which we swallow — a light title bar on an
        unsupported system is a cosmetic miss, not a crash.

        DWM applies the attribute immediately but does not always repaint
        the frame on its own — the title bar stayed white at launch and
        only actually turned dark after some unrelated redraw (e.g.
        switching PLAN/FOCUS) forced Windows to repaint it. The
        SetWindowPos/SWP_FRAMECHANGED call below forces that repaint
        right away instead of waiting for one to happen by accident."""
        if os.name != "nt":
            return
        try:
            import ctypes
            raw_id = win.winfo_id()
            hwnd = ctypes.windll.user32.GetParent(raw_id)
            if not hwnd:
                # GetParent returns 0 for a window with no parent, which
                # a real top-level frequently has — winfo_id() itself is
                # then already the right handle (varies by Tk build).
                hwnd = raw_id
            value = ctypes.c_int(1 if dark else 0)
            results = []
            for attr in (20, 19):   # DWMWA_USE_IMMERSIVE_DARK_MODE, old builds
                res = ctypes.windll.dwmapi.DwmSetWindowAttribute(
                    hwnd, attr, ctypes.byref(value), ctypes.sizeof(value))
                results.append((attr, res))
                if res == 0:
                    break
            SWP_FRAMECHANGED = 0x0020
            SWP_NOMOVE = 0x0002
            SWP_NOSIZE = 0x0001
            SWP_NOZORDER = 0x0004
            SWP_NOACTIVATE = 0x0010
            ctypes.windll.user32.SetWindowPos(
                hwnd, 0, 0, 0, 0, 0,
                SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE
                | SWP_NOZORDER | SWP_NOACTIVATE)
            log.debug("dark titlebar: raw_id=%s hwnd=%s dark=%s "
                      "attempts=%s", raw_id, hwnd, dark, results)
        except Exception as _e:
            log.debug("dark titlebar FAILED: %s", _e)

    # ── Shared window setup — consistent maximize + smooth, debounced save ────
    def _bring_window_front(self, win):
        """Restore and focus an already-open Toplevel — used by every
        "if already open, jump to it instead of opening a second copy"
        window (Product Journey, Business Analysis, Business Dev Plan,
        Habit dashboard, etc.).

        BUG FIXED: the old code at each of these call sites only called
        .lift() + .focus_force(). That does nothing for a MINIMIZED
        window — .lift() only reorders stacking among already-visible
        windows, it doesn't un-minimize one — so clicking the link while
        the window was minimized silently did nothing. It also wasn't
        reliably enough to jump a window that was simply BEHIND another
        one on Windows, which ignores a plain .lift()/.focus_force()
        from a background process as focus-stealing prevention unless
        the window is briefly forced topmost first.

        Fix: explicitly deiconify (undoes minimize) before lifting, and
        use the standard Tk "flash topmost" trick — set -topmost True,
        lift, then immediately clear -topmost — to force the window
        above whatever else is currently in front, without leaving it
        permanently pinned on top afterward."""
        try:
            if win.state() == "iconic":
                win.deiconify()
        except Exception:
            pass
        try:
            win.attributes("-topmost", True)
            win.lift()
            win.after(50, lambda: win.attributes("-topmost", False))
        except Exception:
            try:
                win.lift()
            except Exception:
                pass
        try:
            win.focus_force()
        except Exception:
            pass

    def _setup_window(self, win, key, default_size="1200x800+40+40"):
        """Make any Toplevel open maximized and remember its last state smoothly.

        - Opens MAXIMIZED (zoomed) by default, or restores the user's last
          un-maximized size/position if they resized it before.
        - Saves geometry only AFTER the user stops moving/resizing (debounced),
          which prevents the disk-write storm that made windows open janky.

        key: a unique string per window type, used to store its geometry.
        """
        win.resizable(True, True)
        self._set_dark_titlebar(win, self._mode in ("warroom", "journey"))

        saved = self._detail_geometries.get(key, "zoomed")

        # Apply saved state after the window is mapped (avoids open-time flicker)
        def _apply_state():
            try:
                if saved == "zoomed" or not saved:
                    win.state("zoomed")
                else:
                    win.geometry(saved)
            except Exception as _e:
                log.warning("window state: %s", _e)
                try:
                    win.geometry(default_size)
                except Exception:
                    pass
        win.after(10, _apply_state)

        # Debounced geometry save — fires 400ms after the LAST move/resize
        save_after = [None]

        def _on_configure(e=None):
            if e is not None and e.widget is not win:
                return
            if save_after[0] is not None:
                try:
                    win.after_cancel(save_after[0])
                except Exception:
                    pass

            def _do_save():
                try:
                    # If maximized, store the flag; else store actual geometry
                    if win.state() == "zoomed":
                        self._detail_geometries[key] = "zoomed"
                    else:
                        self._detail_geometries[key] = win.geometry()
                    save_data(self)
                except Exception as _e:
                    log.debug("geo save: %s", _e)
            save_after[0] = win.after(400, _do_save)
        win.bind("<Configure>", _on_configure)

        # This window closes on Escape (does not re-bind global shortcuts)
        win.bind("<Escape>", lambda e: win.destroy())

    def _handle_escape(self, event=None):
        """Close topmost dialog/popup on Escape."""
        try:
            focused = self.focus_get()
            if focused:
                top = focused.winfo_toplevel()
                if top != self:   # it's a dialog — close it
                    top.destroy()
        except Exception as _e:
            log.debug("escape handler: %s", _e)

    # ── Widget-alive helper — guards against stale refs after CLASSIC/FOCUS
    #    view switches, which destroy and rebuild widget trees ───────────────
    def _task_list(self, key=None):
        """Task list for `key` ('classic'/'focus'); defaults to whichever
        list the currently-built panel-3 view owns."""
        k = key or getattr(self, "_active_task_list", "classic")
        return self.tasks_focus if k == "focus" else self.tasks

    def _find_task(self, tid):
        """Locate a task by id across BOTH lists — (task, owning_list)."""
        for lst in (self.tasks, self.tasks_focus):
            for t in lst:
                if t["id"] == tid:
                    return t, lst
        return None, None

    # ── Strike List — today's three commitments ──────────────────────────
    # Deliberately NOT a fourth collection of tasks. `strike` is a flag on
    # the task itself and the Strike List is the derived view of it. The
    # app has already been bitten once by tasks living in more than one
    # place; a separate list would be a new place to lose them, and would
    # need its own migration, its own rollover and its own bugs.
    #
    # `now_id` is runtime only. Nothing about "which task is selected" is
    # worth persisting: on restart it re-derives to the first incomplete
    # strike task, which is the same answer the user would give.
    STRIKE_MAX = 3

    def _strike_tasks(self):
        """Today's committed tasks, in list order.

        Reads tasks_focus EXPLICITLY rather than through _task_list().
        The strike list is a FOCUS concept by definition, but the
        + STRIKE buttons on the project cards are reachable while PLAN
        is the active tab — and _task_list() would then hand back
        self.tasks, so the three-task limit would be measured against
        the wrong list and let a fourth task through."""
        return [t for t in self.tasks_focus
                if t.get("strike") and self._task_matches_day(t)]

    def _strike_counts(self):
        s = self._strike_tasks()
        return sum(1 for t in s if t.get("done")), len(s)

    def _next_tasks(self):
        """Everything else available today — the pool you pick from.
        tasks_focus explicitly, for the same reason as _strike_tasks."""
        return [t for t in self.tasks_focus
                if not t.get("strike") and not t.get("done")
                and self._task_matches_day(t)]

    def _now_task(self):
        """The one task the right panel is pointed at.

        An explicit click wins; otherwise it is the first strike task
        that isn't finished. Deriving rather than storing means the
        selection can never drift out of sync with reality — completing,
        un-starring or deleting the selected task simply changes the
        answer instead of leaving a dangling id behind."""
        nid = getattr(self, "_now_id", None)
        if nid is not None:
            t, _ = self._find_task(nid)
            if t is not None and t.get("strike") and not t.get("done"):
                return t
        for t in self._strike_tasks():
            if not t.get("done"):
                return t
        return None

    def _set_now(self, tid):
        """Point at a task. Any running clock stops first — two tasks
        can never run at once, and switching is not the same as
        starting: the new task waits for a deliberate ▶."""
        cur = self._now_task()
        if cur is not None and cur["id"] in self.task_timers:
            self._stop_task_and_project(cur)
        self._now_id = tid
        save_data(self)
        self._render_tasks()

    def _toggle_strike(self, tid, project_key=None):
        """Put a task in / take it out of today's three.

        project_key is passed when the star was clicked on a PROJECT
        card, which is the only way task.project is ever set. It is
        never inferred from the task's wording — guessing by name is
        exactly what made the Consistency tab unreliable, and a wrong
        guess here would mis-attribute real recorded time."""
        task, _lst = self._find_task(tid)
        if task is None:
            return False
        if task.get("strike"):
            # BUG THIS FIXES: un-starring a task whose clock was running
            # left BOTH clocks going. The task vanished from NOW and from
            # the strike list — the only two places with a stop button —
            # while its project quietly kept banking time, for hours, and
            # the trend chart and TODAY PROGRESS reported that invented
            # time as real work. A clock with no visible way to stop it
            # is worse than no clock.
            if tid in self.task_timers:
                self._stop_task_and_project(task)
            task["strike"] = False
        else:
            if len(self._strike_tasks()) >= self.STRIKE_MAX:
                return False        # caller flashes the limit
            task["strike"] = True
            task.setdefault("day", str(date.today()))
        if project_key:
            task["project"] = project_key
        _was = not task["strike"]

        def _undo(_t=task, _w=_was):
            _t["strike"] = _w
        self._push_undo(
            ("star " if task["strike"] else "un-star ")
            + '"%s"' % (task.get("text", "")[:30]), _undo)
        save_data(self)
        self._render_tasks()
        return True

    # ── Project card → strike list ───────────────────────────────────────
    # A project's subtasks live in vision_data[key]["tasks"] and are a
    # different shape from tasks_focus entries. Rather than merge the two
    # models — which would mean migrating every existing project card —
    # committing one PROMOTES it: a real focus task is created that
    # carries `project` (which project banks the time) and `psrc` (which
    # project row to tick when it's finished).
    #
    # This is the only place `project` is ever written, and it is written
    # from WHERE THE USER CLICKED, never from what the task is called.
    def _pt_committed(self, pid):
        """The live focus task promoted from project row `pid`, if any."""
        return next((t for t in self.tasks_focus if t.get("psrc") == pid), None)

    def _strike_project_task(self, project_key, pid, text):
        """Commit a project card's task to today's strike list.

        Returns False when the day is already full, so the caller can
        say so at the button the user just pressed."""
        cur = self._pt_committed(pid)
        if cur is not None and not cur.get("done"):
            # Already promoted. Re-striking a task that was un-starred
            # earlier today is normal; creating a SECOND focus task for
            # the same project row never is.
            if not cur.get("strike"):
                if len(self._strike_tasks()) >= self.STRIKE_MAX:
                    return False
                cur["strike"] = True
            cur["day"] = str(date.today())
            cur["project"] = project_key
            cur["text"] = text          # keep it in step with a rename
        else:
            if len(self._strike_tasks()) >= self.STRIKE_MAX:
                return False
            cur = {"id": int(time.time() * 1000), "text": text,
                   "done": False, "secs": 0.0, "sessions": [],
                   "est": 0, "mit": False, "strike": True,
                   "project": project_key, "psrc": pid,
                   "day": str(date.today())}
            self.tasks_focus.append(cur)

            def _undo(_l=self.tasks_focus, _n=cur):
                try:
                    _l.remove(_n)
                except ValueError:
                    pass
            self._push_undo('commit "%s"' % text[:30], _undo)
        save_data(self)
        self._render_tasks()
        return True

    def _sync_project_row(self, task):
        """Tick the project card row a finished focus task came from.

        Without this the project's own progress bar would ignore work
        done through NOW — you'd finish a task in the right panel and
        the card on the left would still show it outstanding, so the
        two halves of the screen would disagree about the same task."""
        pid = task.get("psrc")
        pk = task.get("project")
        if not pid or not pk:
            return
        vd = self.vision_data.get(pk)
        if not isinstance(vd, dict):
            return
        for st in vd.get("tasks", []):
            if st.get("pid") == pid:
                st["done"] = bool(task.get("done"))
                break
        # Repaint the card's checkbox in place if it happens to be on
        # screen. A full _apply_theme rebuild would also work and would
        # also throw away the user's scroll position and focus, for one
        # tick mark.
        fn = getattr(self, "_proj_task_sync", {}).get(pid)
        if fn is not None:
            try:
                fn(bool(task.get("done")))
            except Exception as _e:
                log.debug("proj row sync: %s", _e)

    def _strike_click(self, tid):
        """UI wrapper for _toggle_strike: on refusal, say why.

        The limit is silent in the model — _toggle_strike just returns
        False — because a rule and its presentation are different
        concerns. Here it becomes a red 3/3 flash on the counter the
        user was about to change, which explains the refusal at the
        exact place they were looking. A dialog for this would be
        theatre: they can already see three rows above."""
        if self._toggle_strike(tid):
            return
        lbl = self._alive("_strike_count_lbl")
        if lbl is None:
            return
        try:
            lbl.config(fg=self.T("RED"),
                       text=f"{self.STRIKE_MAX}/{self.STRIKE_MAX} — full")
            # _render_now rewrites both the text and the colour from
            # state, so it IS the revert — no need to stash the old
            # values and risk them going stale behind a theme switch.
            self.after(1100, self._render_now)
        except Exception as _e:
            log.debug("strike flash: %s", _e)

    def _now_toggle_run(self):
        """▶ START / ⏸ PAUSE for the NOW task.

        Starting a task starts its PROJECT clock too, when it has one.
        That is the whole payoff of task.project existing: the segmented
        TODAY PROGRESS bar, the Consistency grid and the trend chart all
        fill themselves from the act of doing the work, instead of
        needing a second, separate thing to remember to press."""
        t = self._now_task()
        if t is None:
            return
        running = t["id"] in self.task_timers
        if running:
            self._stop_task_and_project(t)
        else:
            # One clock at a time, across every task.
            for other in list(self.task_timers.keys()):
                ot, _ = self._find_task(other)
                if ot is not None:
                    self._stop_task_and_project(ot)
            self.task_timers[t["id"]] = True
            t.setdefault("sessions", []).append(
                {"start": time.time(), "end": None})
            pk = t.get("project")
            if pk:
                self._toggle_project_timer(pk)
                self._proj_running = pk
        save_data(self)
        self._render_tasks()

    def _complete_now(self):
        """✓ COMPLETE — finish the NOW task and point at the next one.

        The clock does NOT carry over to that next task. Finishing one
        thing and starting the next are two separate decisions, and
        auto-starting would quietly bank the walk to the kettle as deep
        work — the same reason the idle stop exists."""
        t = self._now_task()
        if t is None:
            return
        if t["id"] in self.task_timers:
            self._stop_task_and_project(t)
        t["done"] = True
        self._sync_project_row(t)

        def _undo(_t=t, _s=self._sync_project_row):
            _t["done"] = False
            _s(_t)               # untick the project row too, or undo lies
        self._push_undo('complete "%s"' % (t.get("text", "")[:30]), _undo)
        self._now_id = None          # let it re-derive to the next one
        save_data(self)
        self._render_tasks()

    def _stop_task_and_project(self, task):
        """Stop a task's clock and, if it belongs to a project, that
        project's clock with it — they start together, so they must
        stop together or the project keeps banking time for work that
        has stopped."""
        self._stop_timer(task)
        self.task_timers.pop(task["id"], None)
        pk = task.get("project")
        if pk and getattr(self, "_proj_running", None) == pk:
            self._close_project_session(pk, time.time())
            self._proj_running = None
            try:
                self._refresh_project_time_label(pk)
            except Exception as _e:
                log.debug("stop proj label: %s", _e)

    # ── Discipline habits — shared by PLAN's Discipline tab and the
    # Life Execution Dashboard window. Both read/write the SAME
    # _habit_data keys, so a habit ticked in either place shows as
    # ticked in the other.
    def _habits_for(self, cat):
        """Habit names for a category — the user's customised list if
        they have one, otherwise the shipped defaults."""
        stored = self._habit_data.get(f"__habits_{cat}")
        return stored if stored else list(_HABIT_DEFAULTS.get(cat, []))

    def _habit_state(self, day, cat, name):
        d = self._habit_data.get(day, {})
        c = d.get(cat, {})
        return bool(c.get(name, False)) if isinstance(c, dict) else False

    def _habit_toggle(self, day, cat, name):
        self._habit_data.setdefault(day, {})
        if not isinstance(self._habit_data[day].get(cat), dict):
            self._habit_data[day][cat] = {}
        cur = bool(self._habit_data[day][cat].get(name, False))
        self._habit_data[day][cat][name] = not cur
        save_data(self)
        return not cur

    def _habit_day_counts(self, day):
        """(done, total) habit ticks for one ISO date, across all cats."""
        total = sum(len(self._habits_for(c)) for _, c in _HABIT_CATS)
        done = 0
        for _, cat in _HABIT_CATS:
            for name in self._habits_for(cat):
                if self._habit_state(day, cat, name):
                    done += 1
        return done, total

    def _habit_streak(self):
        """Consecutive days (ending today) where at least half the day's
        habits were ticked. Half rather than all on purpose — a streak
        that breaks on one missed item stops being a streak within a
        week and then tells you nothing."""
        import datetime as _dt
        streak = 0
        d = date.today()
        while True:
            done, total = self._habit_day_counts(str(d))
            if total == 0 or done / total < 0.5:
                break
            streak += 1
            d -= _dt.timedelta(days=1)
        return streak

    # ── Project timers ───────────────────────────────────────────────────
    # Each project card has its own ▶/⏸. This is what TODAY PROGRESS is
    # built from: the point of the bar is to answer "did I touch every
    # project today", and only a per-project clock can answer that.
    # Seconds live in _habit_data["__ptime_<key>"] = {"YYYY-MM-DD": secs},
    # written straight to the dict every tick rather than held in a
    # start-timestamp — a crash then costs one second, not the session.
    def _ptime_log(self, key):
        d = self._habit_data.get(f"__ptime_{key}")
        return d if isinstance(d, dict) else {}

    def _proj_secs(self, key, day=None):
        try:
            return float(self._ptime_log(key).get(day or str(date.today()), 0))
        except Exception:
            return 0.0

    def _proj_add_secs(self, key, secs):
        d = dict(self._ptime_log(key))
        today = str(date.today())
        # Never below zero: the refunds below subtract from this same
        # bucket, and a negative day would poison the totals, the trend
        # chart and the streak all at once.
        d[today] = max(0.0, float(d.get(today, 0)) + secs)
        self._habit_data[f"__ptime_{key}"] = d

    def _close_project_session(self, key, now, idle_secs=0.0):
        """End the running session for `key`, refunding time that turned
        out not to be work.

        Time is banked second-by-second in _tick so the on-screen clock
        moves while you work; that means anything we later decide was
        NOT work has to be given back here. Two refunds:

          idle  — the stretch with no keyboard or mouse before the
                  auto-stop fired. You were away; it isn't work time.
          tiny  — an AUTO-started session that never reached two
                  minutes: opening a project window to re-read one note.
                  Only auto sessions are discarded this way. If you
                  pressed play yourself you meant it, however short.
        """
        sess = getattr(self, "_proj_session", None)
        if not sess or sess.get("key") != key:
            self._proj_session = None
            return
        banked = float(sess.get("banked", 0.0))
        refund = min(max(0.0, idle_secs), banked)
        effective = banked - refund
        if sess.get("auto") and effective < self._MIN_SESSION_SECS:
            refund += effective
        if refund > 0:
            self._proj_add_secs(key, -refund)
            self.progress_secs = self._proj_total_today()
        self._proj_session = None

    def _proj_target_secs(self, key):
        """This project's own daily target, in seconds. Shares the value
        the Consistency tab already edits (__consist_tgt_<key>), so the
        two features can't disagree about what 'on target' means."""
        return self._consist_target(key) * 60.0

    def _named_projects(self):
        """Project configs that have actually been given a title. An
        unnamed slot is not a project you're neglecting — it's an empty
        slot, and counting it would permanently dilute every total."""
        out = []
        for cfg in self._project_cfgs():
            t = ((self.vision_data.get(cfg["key"], {}) or {}).get("title")
                 or "").strip()
            if t:
                out.append((cfg, t))
        return out

    def _project_done_today(self, key):
        """Has this project met its OWN daily target today?"""
        try:
            tgt = self._proj_target_secs(key)
            return tgt > 0 and self._proj_secs(key) >= tgt
        except Exception as e:
            log.debug("proj done: %s", e)
            return False

    def _project_order(self):
        """[(permanent_number, cfg)] — finished projects sink.

        Same idea as the task list's Zeigarnik sort: what is still owed
        stays at the top, what is settled drops out of the way. With six
        cards down a narrow panel, the one you should open next should
        not be the one you have to scroll past three finished ones to
        reach.

        The NUMBER travels with the project, it is not the row position.
        Renumbering on the move would break the segmented TODAY PROGRESS
        bar, whose segments are labelled 1-6 by exactly this identity —
        segment 2 has to keep meaning the same project all day.

        Nothing is stored. "Finished" is derived from today's seconds
        against today's target, so at midnight every project is unfinished
        again and the order returns to 1-6 on its own."""
        numbered = list(enumerate(self._project_cfgs(), start=1))
        # Stable sort: within each group the original 1-6 order survives.
        numbered.sort(key=lambda p: 1 if self._project_done_today(p[1]["key"])
                      else 0)
        return numbered

    def _proj_total_today(self):
        return sum(self._proj_secs(c["key"]) for c, _ in self._named_projects())

    def _proj_meaningful(self, key, day=None):
        """Did this project get REAL time on `day`, not just a tap?

        A minute of an hour's target is not "worked on it today". The
        floor is a quarter of the project's own target — so a 30-minute
        project needs 7-8 minutes and a 2-hour one needs 30 — with a
        hard 5-minute minimum so a tiny target can't make the bar
        trivially satisfiable. Used for the 'N/6 projects today' count
        and the Consistency streak alike, so both mean the same thing."""
        tgt = self._proj_target_secs(key)
        floor = max(300.0, tgt * 0.25)
        return self._proj_secs(key, day) >= floor

    # ── Idle detection ───────────────────────────────────────────────────
    # How long the keyboard and mouse have been untouched, system-wide.
    # Uses GetLastInputInfo through ctypes — ctypes is stdlib, so this
    # keeps the app's zero-external-dependency rule intact (no pywin32).
    # Returns 0.0 anywhere it can't measure, which makes every caller
    # degrade to "never idle" — i.e. exactly the old behaviour.
    @staticmethod
    def _idle_seconds():
        if os.name != "nt":
            return 0.0
        try:
            import ctypes

            class _LII(ctypes.Structure):
                _fields_ = [("cbSize", ctypes.c_uint),
                            ("dwTime", ctypes.c_uint)]
            lii = _LII()
            lii.cbSize = ctypes.sizeof(_LII)
            if not ctypes.windll.user32.GetLastInputInfo(ctypes.byref(lii)):
                return 0.0
            millis = ctypes.windll.kernel32.GetTickCount() - lii.dwTime
            return max(0.0, millis / 1000.0)
        except Exception:
            return 0.0

    def _idle_limit_secs(self):
        """Minutes of inactivity before a running project timer stops
        itself. Settings-driven because the right number depends on the
        work: typing code idles for seconds, reading a supplier contract
        or being on a call idles for twenty minutes and is still work."""
        try:
            return max(2, min(120, int(
                self._settings.get("idle_stop_min", 15)))) * 60
        except Exception:
            return 900

    # Sessions shorter than this are thrown away rather than logged.
    # Opening a project window to re-read one note is not work, and a
    # record full of 40-second entries makes the honest ones worthless.
    _MIN_SESSION_SECS = 120

    def _toggle_project_timer(self, key, auto=False):
        """Start this project's clock, stopping any other. Deliberately
        exclusive — parallel project timers would let one hour of real
        work count as three hours across three projects.

        `auto` marks a start that the app decided on (a project window
        was opened) rather than one the user asked for. Auto-started
        sessions are the ones subject to the short-session discard, so
        merely looking something up never lands in the record."""
        cur = getattr(self, "_proj_running", None)
        now = time.time()
        # Close out whatever was running before switching away from it.
        if cur and cur != key:
            self._close_project_session(cur, now)
        if cur == key:
            self._close_project_session(cur, now)
            self._proj_running = None
        else:
            self._proj_running = key
            self._proj_session = {"key": key, "start": now, "auto": auto,
                                  "banked": 0.0}
        save_data(self)
        # Repaint just the affected cards, not the whole panel: a full
        # rebuild would close every open sub-window (see _plan_rebuild).
        for k in (cur, key):
            if k:
                self._refresh_project_time_label(k)
        # A project that has just met its daily target sinks — but ONLY
        # here, on the stop, never mid-session.
        #
        # Re-sorting the instant the clock crosses the target would slide
        # the card out from under the note you are typing into it. The
        # moment you press stop is the one moment you are demonstrably
        # done with that card, so it is the only safe time to move it.
        if cur == key and self._project_done_today(key):
            self.after(400, lambda: self.winfo_exists()
                       and self._apply_theme(self._mode))
        try:
            self._update_progress_bar()
        except Exception as _e:
            log.debug("proj timer bar: %s", _e)

    # Presets rather than free typing: the useful answers to "how long
    # a day on this project" are coarse, and a spinner you can land on
    # 37 minutes with invites fiddling instead of deciding.
    _PROJ_TARGETS = (15, 30, 45, 60, 90, 120)

    def _cycle_project_target(self, key):
        cur = self._consist_target(key)
        opts = self._PROJ_TARGETS
        # Next preset ABOVE the current value, wrapping. Written this way
        # rather than opts.index(cur) so a value the Consistency tab's
        # finer −/+ stepper produced (say 75) still steps sensibly to 90
        # instead of snapping back to a default.
        nxt = next((o for o in opts if o > cur), opts[0])
        self._habit_data[f"__consist_tgt_{key}"] = nxt
        save_data(self)
        self._refresh_project_time_label(key)
        try:
            # The daily goal is the SUM of these targets, so the bar and
            # the percentage beside it both move when one changes.
            self._update_progress_bar()
        except Exception as _e:
            log.debug("target cycle bar: %s", _e)

    def _auto_timer_on_open(self, key):
        """Opening a project's Business Analysis or Product Journey
        window starts that project's clock.

        The reason this exists: a manual timer has to be remembered at
        the exact moment your attention is going INTO the work and
        furthest from the app — which is why it kept not being pressed
        while real work happened, leaving every downstream number at
        zero. Opening the project's own window is a reliable signal
        that you are about to work on it, and it costs no extra action.

        The obvious objection is that a window can sit open while you're
        doing something else entirely. That's handled, but not here: the
        idle auto-stop in _tick ends the session once the keyboard and
        mouse go quiet, and refunds that stretch; and a session that
        never reached two minutes is discarded outright, so opening a
        window to re-read one note logs nothing.
        """
        if not self._settings.get("auto_timer_on_open", True):
            return
        if getattr(self, "_proj_running", None) == key:
            return          # already running for this project
        try:
            self._toggle_project_timer(key, auto=True)
        except Exception as _e:
            log.debug("auto timer start: %s", _e)

    def _auto_timer_on_close(self, key):
        """Closing the window ends the auto-started session — but only
        if it's still the one running. If you switched to another
        project meanwhile, that project's clock must not be stopped by
        this window closing."""
        if getattr(self, "_proj_running", None) != key:
            return
        sess = getattr(self, "_proj_session", None)
        if not sess or not sess.get("auto"):
            return          # you started this one by hand — leave it alone
        try:
            self._close_project_session(key, time.time())
            self._proj_running = None
            save_data(self)
            self._refresh_project_time_label(key)
            self._update_progress_bar()
        except Exception as _e:
            log.debug("auto timer stop: %s", _e)

    @staticmethod
    def _proj_time_text(secs, tgt):
        """"15m / 1h" — the ONE place this pair is worded.

        The collapsed-card line grew its own copy of this and wrote
        "0m / 60m" while the open card two rows below said "15m / 1h" —
        the same target in two different languages, which reads as two
        different settings."""
        m = int(secs // 60)
        tm = int(tgt // 60)
        _done = "%dh %02dm" % (m // 60, m % 60) if m >= 60 else "%dm" % m
        _tgt = ("%dh" % (tm // 60)) if tm >= 60 and tm % 60 == 0 else "%dm" % tm
        return "%s / %s" % (_done, _tgt)

    def _refresh_project_time_label(self, key):
        """Update one project card's elapsed readout and ▶/⏸ state."""
        ref = getattr(self, "_proj_time_lbls", {}).get(key)
        if not ref:
            return
        lbl, btn, acc_col, sec_txt = ref[0], ref[1], ref[2], ref[3]
        line = ref[4] if len(ref) > 4 else None
        try:
            if not lbl.winfo_exists():
                return
            secs = self._proj_secs(key)
            tgt = self._proj_target_secs(key)
            running = getattr(self, "_proj_running", None) == key
            txt = self._proj_time_text(secs, tgt)
            done = secs >= tgt > 0
            lbl.config(text=("✓ " if done else "") + txt,
                       fg=self.T("DONE_GREEN") if done
                       else (acc_col if running else sec_txt))
            if line is not None and line.winfo_exists():
                w = max(1, line.winfo_width())
                line.delete("all")
                frac = min(1.0, secs / tgt) if tgt > 0 else 0.0
                if frac > 0:
                    # Full accent while the clock is running, a muted
                    # blend when it is not: the same bar answers "how far"
                    # and "is it going" without a second indicator.
                    line.create_rectangle(
                        0, 0, int(w * frac), 3, outline="",
                        fill=(self.T("DONE_GREEN") if done
                              else (acc_col if running
                                    else _blend(acc_col, self.T("CARD_BG"),
                                                0.45))))
            if btn.winfo_exists():
                btn.config(text="⏸" if running else "▶",
                           bg=acc_col if running else
                           _PANEL_COLORS[self._mode]["input_bg"],
                           fg=_ink(acc_col) if running else acc_col,
                           activebackground=acc_col if running else
                           _PANEL_COLORS[self._mode]["card2"],
                           activeforeground=_ink(acc_col) if running else acc_col)
        except Exception as _e:
            log.debug("proj time label: %s", _e)

    def _cancel_after(self, attr):
        """Cancel one stored after() id and forget it. Safe to call twice
        and safe to call for a timer that already fired."""
        _id = getattr(self, attr, None)
        if _id is None:
            return
        setattr(self, attr, None)
        try:
            self.after_cancel(_id)
        except Exception:
            pass

    def _cancel_all_after(self):
        """Cancel every pending after() before the window is destroyed.

        This app schedules several repeating callbacks — _tick every
        50ms, plus _maybe_mit_prompt — and none
        of them were cancelled on close. Tk then fires them into a
        half-destroyed interpreter, which prints `invalid command name
        "..._tick"` and, in some builds, segfaults instead of raising.
        Windows usually hides it because the process exits before the
        next 50ms tick lands; that is luck, not correctness, and it is
        exactly the shape of an "it crashed when I closed it" report.

        Asking Tk for the pending ids rather than tracking them by hand
        means a timer added later cannot be forgotten here."""
        try:
            for _id in self.tk.call("after", "info"):
                try:
                    self.after_cancel(_id)
                except Exception:
                    pass
        except Exception as _e:
            log.debug("cancel afters: %s", _e)

    def _alive(self, attr):
        w = getattr(self, attr, None)
        if w is None:
            return None
        try:
            return w if w.winfo_exists() else None
        except Exception:
            return None

    # ── Theme helper ─────────────────────────────────────────────────────────
    def T(self, key):
        """Return current theme colour for given key."""
        return THEMES[self._mode][key]

    # ── Deep-work data model — history, streak, weekly stats ─────────────────
    def _goal_secs(self):
        """Daily deep-work goal in seconds for PLAN.

        Derived from the per-project daily targets when any project is
        named, because TODAY PROGRESS is now the sum of the project
        timers — a separate Settings number would mean the bar could
        read 100% while two projects sat untouched, or never reach 100%
        even after every project hit its target. Falls back to the
        Settings hours only when no project has been named yet."""
        try:
            _t = sum(self._proj_target_secs(c["key"])
                     for c, _ in self._named_projects())
            if _t > 0:
                return _t
        except Exception as _e:
            log.debug("goal from projects: %s", _e)
        try:
            return max(0.5, float(self._settings.get("goal_hours", 5))) * 3600
        except Exception:
            return FIVE_HOURS

    def _goal_secs_focus(self):
        """Daily deep-work goal in seconds for FOCUS — independent from
        PLAN's goal_hours so the two screens can track different daily
        time targets (e.g. 5h overall PLAN budget vs 2h dedicated FOCUS
        session budget), each set separately in Settings."""
        try:
            return max(0.5, float(self._settings.get("goal_hours_focus", 5))) * 3600
        except Exception:
            return FIVE_HOURS

    def _is_focus_tab(self):
        """True when the FOCUS tab (panel3_view == 'focus') is the one
        currently on screen — used to pick which of the two independent
        progress accumulators (PLAN vs FOCUS) the shared prog_* widgets
        should read from."""
        return self._settings.get("panel3_view", "classic") == "focus"

    def _record_today(self):
        """Snapshot today's numbers into daily_history (keeps 90 days)."""
        try:
            hist = self._daily_history
            hist[str(date.today())] = {
                "secs": int(self._proj_total_today() or self.progress_secs),
                "done": sum(1 for t in self.tasks + self.tasks_focus
                            if t["done"]),
            }
            if len(hist) > 90:
                for k in sorted(hist)[:-90]:
                    hist.pop(k, None)
        except Exception as e:
            log.debug("record_today: %s", e)

    def _rollover_day(self):
        """Archive yesterday and reset every per-day counter for today.

        ROOT CAUSE of "today progress doesn't freshly load at 12am":
        __init__ used to have its OWN short-circuit version of this check
        (just progress_date + progress_secs, nothing else) for the
        cold-start case — app closed before midnight, reopened the next
        morning. That partial reset ran first and already bumped
        progress_date to today, so by the time _tick's fuller version
        checked `self.progress_date != str(date.today())` a moment
        later, it was already False and never ran at all. Net effect:
        opening the app on a new day zeroed the percentage but silently
        carried every task's elapsed timer, work_secs, and MIT star
        forward from yesterday — and yesterday never got archived into
        history because only _tick's version did that part.

        Now both call sites (the cold-start check in __init__ and the
        while-running check in _tick) call this one method, so there's
        only one definition of "what a new day resets" to drift out of
        sync with itself."""
        try:      # finalize yesterday into history before wiping
            # Summed straight from the per-project logs for the DATE
            # being closed, rather than from self.progress_secs. Same
            # number in the normal case, but immune to ordering: whether
            # rollover runs before or after _tick recomputes the live
            # total, the archived figure is still yesterday's.
            _y = sum(self._proj_secs(c["key"], self.progress_date)
                     for c, _ in self._named_projects())
            self._daily_history[self.progress_date] = {
                "secs": int(_y or self.progress_secs),
                "done": sum(1 for t in self.tasks + self.tasks_focus
                            if t["done"])}
        except Exception as _e:
            log.debug("hist rollover: %s", _e)
        self.progress_date = str(date.today())
        self.progress_secs = 0.0
        self.focus_progress_secs = 0.0
        self.work_secs = 0.0
        # A project clock left running overnight would otherwise quietly
        # bank eight hours of "work" against the new day.
        self._proj_running = None
        self._proj_session = None
        # Reset all task timers for the new day (both lists)
        for t in self.tasks + self.tasks_focus:
            t["secs"] = 0.0
            self.task_timers.pop(t["id"], None)
            t["mit"] = False   # yesterday's MIT no longer applies
            # Strike is a DAILY commitment, not a property of the task.
            # The task, its project and its history all survive; only
            # "I chose this as one of today's three" expires. Yesterday's
            # unfinished work may well deserve a place today, but that is
            # a decision for the person, not a default for the app.
            t["strike"] = False
        self._now_id = None
        # A block opened by hand yesterday must not still be open today —
        # the new day should start on the automatic answer.
        self._exec_open = {}

    def _hist_secs(self, d):
        return int(self._daily_history.get(str(d), {}).get("secs", 0))

    def _deep_streak(self):
        """Consecutive days hitting the goal (today counts once reached)."""
        import datetime as _dt
        goal = self._goal_secs()
        day = _dt.date.today()
        if self._hist_secs(day) < goal:      # today not finished → count from yesterday
            day -= _dt.timedelta(days=1)
        n = 0
        while self._hist_secs(day) >= goal:
            n += 1
            day -= _dt.timedelta(days=1)
        return n

    def _week_stats(self):
        """Last 7 days → (score 0-100, avg_secs, best_day, best_secs, done_n).

        Score formula (documented, deterministic):
          60% — average deep-work hours vs daily goal
          25% — tasks completed this week (14 = full marks)
          15% — goals marked done (3 = full marks)
        """
        import datetime as _dt
        goal = self._goal_secs()
        today = _dt.date.today()
        days = [today - _dt.timedelta(days=i) for i in range(6, -1, -1)]
        secs = [self._hist_secs(d) for d in days]
        avg = sum(secs) / 7.0
        bi = max(range(7), key=lambda i: secs[i])
        done = sum(int(self._daily_history.get(str(d), {}).get("done", 0))
                   for d in days)
        # ALL projects' goals, not just the one panel 2 happens to be
        # showing. This is a weekly score for the week you had, and it
        # would otherwise change every time you clicked a different
        # project card — a score that moves when you only looked at
        # something is not a score.
        goals_hit = sum(1 for _lists in self._goals_by_project.values()
                        for _t in GOAL_TYPES
                        for g in _lists.get(_t, []) if g.get("done"))
        score = (min(avg / goal, 1.0) * 60
                 + min(done / 14.0, 1.0) * 25
                 + min(goals_hit / 3.0, 1.0) * 15)
        return int(round(score)), avg, days[bi].strftime("%a"), secs[bi], done

    # =========================================================================
    def _build_ui(self):
        bg = self.T("BG")
        self.configure(bg=bg)
        # Column weights are owned entirely by _apply_panel_layout (run at
        # the end of this method) — the split depends on which panels show.
        self.columnconfigure(2, weight=0)                     # clock — fixed
        self.rowconfigure(0, weight=1)

        # Panel 1 (left) — Projects (moved from col 2, now flexible).
        # Container created now (cheap), but its CONTENT (6 projects'
        # worth of task rows, notes, progress canvases, tooltips) is
        # deferred — see below. Startup always opens in "compact"
        # layout where panels 1 & 2 are hidden anyway, so building
        # them fully before the window even shows was pure wasted time
        # on the critical path: the window stays withdrawn (invisible)
        # for the ENTIRE _build_ui() call, so every widget built here
        # was time the user just stared at nothing.
        proj = tk.Frame(self, bg=bg)
        proj.grid(row=0, column=0, sticky="nsew", padx=(0, _PANEL_GAP))
        proj.columnconfigure(0, weight=1)
        proj.rowconfigure(0, weight=1)
        self._panel_projects = proj

        # Already 1px wide — what made it read as a heavy rule was the
        # TONE, so it's blended 35% toward the page background. _heat is
        # just a two-colour blend, reused here rather than duplicated.
        _div = _heat(_PANEL_COLORS[self._mode]["border"], 0.0, bg)
        self._sep1 = tk.Frame(self, bg=_div, width=1)
        self._sep1.grid(row=0, column=1, sticky="nws", padx=(_PANEL_GAP, 0))

        # Panel 2 (middle) — Goals. Container only; content deferred too.
        right = tk.Frame(self, bg=bg)
        right.grid(row=0, column=1, sticky="nsew", padx=(_PANEL_GAP,) * 2)
        right.columnconfigure(0, weight=1)
        right.rowconfigure(0, weight=1)
        self._panel_goals = right
        self._arrow_p1 = self._mk_layout_arrow(right, self._toggle_panel1)

        # sticky WITHOUT "e" so it stays 1px on the column's west edge.
        # The old padx=(0, _PANEL3_W - 1) pin only worked while column 2
        # was a fixed 545px; once it took a 25% share anything wider
        # turned the hairline into a block (89px at 2560).
        self._sep2 = tk.Frame(self, bg=_div, width=1)
        self._sep2.grid(row=0, column=2, sticky="nws")

        # Panel 3 (right) — Clock/Timer/Tasks. Built SYNCHRONOUSLY and
        # FIRST-ish (columnconfigure above already happened) because
        # this is the one panel "compact" layout actually shows on
        # every launch — it's the only thing on the critical path to a
        # usable window.
        left = tk.Frame(self, bg=bg, width=_PANEL3_W)
        left.grid(row=0, column=2, sticky="ns", padx=(_PANEL_GAP, 0))
        left.grid_propagate(False)
        left.columnconfigure(0, weight=1)
        self._build_left(left)
        # NOTE: task-card row already carries weight=1 (set inside
        # _build_task_card) — do NOT also weight a dummy row here, or Tk
        # splits the extra space between them, leaving dead space below
        # the task list in both CLASSIC and FOCUS views.
        self._panel_clock = left
        self._arrow_p2 = self._mk_layout_arrow(left, self._toggle_panel2)

        # Panel layout survives theme rebuilds (Ctrl+T destroys all widgets).
        # Safe to run before panels 1/2 have real content — it only calls
        # .grid()/.grid_remove() on the (already-created, still-empty)
        # container frames, never touches their children.
        self._apply_panel_layout(self._panel_layout, resize=False)

        # Panels 1 & 2's actual content is built once the event loop is
        # idle — i.e. after this method returns, __init__ finishes and
        # deiconify() shows the window. The user sees a usable compact
        # window almost immediately instead of staring at nothing while
        # every project/task/goal widget gets constructed up front.
        def _build_deferred_panels():
            try:
                self._build_projects(self._panel_projects)
                self._build_right(self._panel_goals)
            except Exception as _e:
                log.warning("deferred panel build failed: %s", _e)

        if getattr(self, "_ui_built_once", False):
            # This is a REBUILD (theme switch / panel3-view toggle), not
            # the initial launch. _apply_theme calls _render_tasks() /
            # _render_goals() immediately after _build_ui() returns, so
            # panels 1+2's content must exist right now — deferring it
            # left those calls holding stale attribute references from
            # the PREVIOUS build (already destroyed a few lines above),
            # which crashed with "bad window path name" the moment a
            # rebuild fired (e.g. the panel3 PLAN/FOCUS toggle).
            _build_deferred_panels()
        else:
            self._ui_built_once = True
            self.after_idle(_build_deferred_panels)

    # =========================================================================
    def _build_left(self, p):
        """Build left panel — clock, timer, progress, buttons, weekly goal."""
        # Theme colours used by this method are read from the _HERO table
        # below; the long list of self.T(...) lookups that used to sit
        # here became dead when the motto bar, the 24h ring and the
        # stacked time/date labels were removed.
        bg = self.T("BG")
        row = 0

        # ── Panel-3 view switcher — CLASSIC ⟷ FOCUS ──────────────────────────
        row = self._panel3_tabs(p, row)

        # Settings gear pinned to panel 3's top-right corner — created
        # HERE, once, common to both views. It used to only be built
        # inside the CLASSIC-only code below the early "return" for
        # FOCUS view, which meant Settings was completely unreachable
        # while FOCUS view was active (no gear button existed at all).
        self._mode_btn = self._mk_corner_settings_btn(p)

        if self._settings.get("panel3_view", "classic") == "focus":
            self._build_focus_view(p, row)
            return
        # stale FOCUS-view handles (widgets destroyed on rebuild)
        self._fv_time_lbl = None

        # ══════════════════════════════════════════════════════════════════════
        # ONE BIG CARD — contains everything: motto, clock, time, date,
        # progress, buttons
        # Colors are 100% theme-driven across all 4 premium themes
        # ══════════════════════════════════════════════════════════════════════
        # CARD_MUT (last column) is a genuinely NEUTRAL text colour, and
        # it's new. Every colour this table offered was a tint of the
        # theme accent, so anything drawn inside the hero card had no
        # choice but to be accent-coloured — which is how the card ended
        # up with ~8 different cyan things all shouting equally. A muted
        # tone gives reference text (week score, static counts) somewhere
        # quieter to sit, so the accent can go back to meaning "live" or
        # "you can act on this".
        # CARD_BG2 (the first column) is the hero card's tint, and the
        # light themes were NOT on the same step of the colour ramp:
        # focus/rize used a -50 (near-white, a hint of hue) while energy
        # and corporate used a -100, which is one step stronger. That is
        # invisible in a swatch and very visible at full card size — on
        # ENERGY it turned the entire top third of the window into a
        # saturated pink panel, and since red universally reads as
        # "error", the card announced a problem when nothing was wrong.
        # All light themes now sit on -50; the accent still does the
        # signalling, the surface just stops shouting along with it.
        _HERO = {
            # (CARD_BG2, CARD_FG1, CARD_FG2, PILL_BG, PILL_FG, PILL_BD, WCARD_BORDER, CARD_MUT)  # noqa: E501
            "focus": ("#EEF2FF", "#1E3A8A", "#2960E6", "#FFFFFF", "#2960E6", "#C7D7FF", "#C7D7FF", "#576D94"),  # noqa: E501 (aligned colour table / unpack — clearer on one line)
            "warroom": ("#0A0A0E", "#22D3EE", "#06B6D4", "#141417", "#22D3EE", "#061820", "#061820", "#78808C"),  # noqa: E501 (aligned colour table / unpack — clearer on one line)
            "energy": ("#FEF2F2", "#991B1B", "#D02222", "#FFFFFF", "#D02222", "#FECACA", "#FECACA", "#936262"),  # noqa: E501 (aligned colour table / unpack — clearer on one line)
            "corporate": ("#FFFBEB", "#92400E", "#AE5009", "#FFFFFF", "#AE5009", "#E7E2DB", "#E7E2DB", "#81704E"),  # noqa: E501 (aligned colour table / unpack — clearer on one line)
            "journey": ("#0F1412", "#4CE0A0", "#38B384", "#161B19", "#4CE0A0", "#17211D", "#17211D", "#73897F"),  # noqa: E501 (aligned colour table / unpack — clearer on one line)
            "rize": ("#EEF2FF", "#312E81", "#5255EF", "#FFFFFF", "#5255EF", "#E0E3FF", "#E0E3FF", "#6267A8"),  # noqa: E501 (aligned colour table / unpack — clearer on one line)
        }
        (CARD_BG2, CARD_FG1, CARD_FG2, PILL_BG, PILL_FG, PILL_BD, _WBDR,
         CARD_MUT) = _HERO[self._mode]

        _wsh = tk.Frame(p, bg=_SHADOW[self._mode])
        _wsh.grid(row=row, column=0, sticky="nsew",
                  padx=SP2, pady=(0, 0))
        row += 1
        wcard = tk.Frame(_wsh, bg=CARD_BG2,
                         highlightthickness=1,
                         highlightbackground=_WBDR)
        wcard.pack(fill="both", expand=True, padx=(0, 2), pady=(0, 2))
        wcard.columnconfigure(0, weight=1)
        p.rowconfigure(row - 1, weight=0)

        # Two-column top row: day-phase bars LEFT, clock/time/date RIGHT.
        # 60/40 split per spec — uniform=... plus weights 3:2 makes Tk
        # divide the row in exactly that ratio at any panel width (plain
        # weights alone only split the LEFTOVER space after each column's
        # natural size, which is not the same thing).
        top_row = tk.Frame(wcard, bg=CARD_BG2)
        top_row.grid(row=0, column=0, sticky="ew", padx=SP4, pady=(SP4, 0))
        top_row.columnconfigure(0, weight=3, uniform="hero")
        top_row.columnconfigure(1, weight=2, uniform="hero")

        bars_col = tk.Frame(top_row, bg=CARD_BG2)
        bars_col.grid(row=0, column=0, sticky="new", padx=(0, SP3))
        self._build_phase_bars(bars_col, CARD_BG2)
        # TODAY / MONTH / YEAR remaining — moved here from the FOCUS
        # screen. The phase bars leave real dead space underneath them
        # in this column, and this is orientation info ("how much of the
        # day/month/year is left"), which belongs on the PLAN screen you
        # look at first — not on FOCUS, where the only thing that should
        # be competing for attention is the running session.
        self._build_scope_stats(bars_col, CARD_BG2, row=1,
                                box_bg=PILL_BG, box_bd=PILL_BD,
                                cap_fg=CARD_MUT, val_fg=CARD_FG1)

        # "nsew" (not bare "n") so the column actually spans its half and
        # its children can centre inside it — with sticky="n" the frame
        # shrank to its widest child and the time/date drifted off to the
        # right edge instead of sitting centred under the clock face.
        clock_col = tk.Frame(top_row, bg=CARD_BG2)
        clock_col.grid(row=0, column=1, sticky="nsew")

        # (Settings gear is created once in _build_left, common to both
        # CLASSIC and FOCUS — see the top-right corner pin there.)

        # ── ONE unified card: analog clock + digital time + date all
        #    drawn as items on a single canvas (see _draw_clock_face).
        #    They used to be three separate stacked widgets sitting on the
        #    panel background, which is why they read as loose, unrelated
        #    elements rather than one "what time is it" card — and why
        #    the card couldn't have rounded corners (Tk widgets can't).
        # Must be set BEFORE the first _draw_clock_face() — the draw pass
        # reads it for the canvas fill. It used to be assigned ~130 lines
        # further down, so the first paint of every build used the
        # PREVIOUS theme's colour (or a hard-coded mint default on a cold
        # start) until the next redraw quietly corrected it.
        self._clock_bg = CARD_BG2
        # Just the INITIAL height; _draw_clock_face auto-fits it to the
        # real content once the fonts have actually been measured.
        _card_h = (_CARD_PAD * 2 + _CLOCK_SZ + _GAP_CLOCK_TIME + 46
                   + _GAP_TIME_SEC + 22 + _GAP_SEC_DATE + _DATE_LINE_H * 2)
        self.clock_cv = tk.Canvas(clock_col, height=_card_h,
                                  bg=CARD_BG2, highlightthickness=0)
        self.clock_cv.pack(fill="x", expand=True)
        # Width is whatever the 40% column grants, so the card and every
        # item on it must re-centre whenever that width changes.
        self.clock_cv.bind("<Configure>", lambda e: self._draw_clock_face())
        # digital_lbl / date_lbl are canvas items now, not widgets — null
        # the old attribute names so _alive() reports them absent instead
        # of handing back a destroyed widget from a previous build.
        self.digital_lbl = None
        self.date_lbl = None
        self._draw_clock_face()

        # ── Thin divider ──────────────────────────────────────────────────────
        tk.Frame(wcard, bg=_WBDR,
                 height=1).grid(row=1, column=0, sticky="ew", padx=SP4, pady=(2, 0))

        # ── DEEP WORK TREND block ─────────────────────────────────────────────
        # TODAY PROGRESS used to be the top half of this card. It moved to
        # the FOCUS panel (see _build_today_progress): "how far into today
        # am I" is a question you ask while working, and FOCUS is the
        # screen you are on while working. PLAN keeps the 30/90-day trend,
        # which is the opposite timescale and the reason to open PLAN.
        trend_block = tk.Frame(wcard, bg=PILL_BG,
                               highlightthickness=1,
                               highlightbackground=PILL_BD)
        trend_block.grid(row=2, column=0, sticky="ew",
                         padx=SP2, pady=(6, 3))
        trend_block.columnconfigure(0, weight=1)
        # Widgets that now live on FOCUS. Popped rather than left pointing
        # at destroyed Tk objects, so the _alive()/hasattr guards in
        # _update_progress_bar skip this view cleanly instead of raising.
        for _a in ("prog_outer", "prog_lbl", "prog_pct_lbl",
                   "prog_time_lbl", "streak_lbl"):
            self.__dict__.pop(_a, None)

        # ── Deep-work trend ──────────────────────────────────────────────────
        # Replaces three things that used to sit here: the "5h 0m left"
        # label, the 7-day bar sparkline, and the "WEEK 0/100 · avg · best"
        # stats line.
        #
        # Why they went. The three text lines were the SAME number said
        # three ways ("0h 0m / 5h", "0%", "5h 0m left"), and the block's
        # largest element — a full-width empty bar — was carrying the
        # least information on the screen. The 7 bars were 6px wide with
        # no axis and no values, so they couldn't be read; and 7 days is
        # too short a window to answer the only question worth asking
        # here, which is "am I trending up or down". WEEK n/100 was a
        # score you cannot act on: knowing it is 43 rather than 51
        # changes nothing about today.
        #
        # A line over 30-90 days answers the trend question, and is also
        # the correct chart type for this panel's ~580px width — 90 bars
        # would be 6px each and unreadable, 90 line points are fine.
        # Data comes from _daily_history, which has been recording 90
        # days of seconds-per-day all along and was never shown.
        trend_hdr = tk.Frame(trend_block, bg=PILL_BG)
        trend_hdr.grid(row=0, column=0, sticky="ew", padx=SP3, pady=(4, 0))
        trend_hdr.columnconfigure(1, weight=1)
        tk.Label(trend_hdr, text="DEEP WORK TREND", bg=PILL_BG, fg=CARD_MUT,
                 font=F_XS).grid(row=0, column=0, sticky="w")
        self.trend_hint = tk.Label(trend_hdr, text="", bg=PILL_BG,
                                   fg=CARD_MUT, font=F_XS, anchor="e")
        self.trend_hint.grid(row=0, column=1, sticky="e", padx=(6, 6))

        _rng = int(self._settings.get("trend_days", 30))
        for _ci, _dn in enumerate((30, 90)):
            _on = (_rng == _dn)
            _rb = tk.Button(trend_hdr, text=f"{_dn}d",
                            command=lambda n=_dn: self._set_trend_days(n),
                            bg=self.T("GREEN") if _on else PILL_BG,
                            fg=_ink(self.T("GREEN")) if _on else CARD_MUT,
                            font=F_XS, relief="flat", bd=0, cursor="hand2",
                            padx=5, pady=0,
                            activebackground=self.T("GREEN") if _on else PILL_BG,
                            activeforeground=_ink(self.T("GREEN")) if _on else self.T("GREEN"))
            _rb.grid(row=0, column=2 + _ci, padx=(2, 0))

        # ── This week, in facts ──────────────────────────────────────────────
        # There is deliberately no "7d" button on the toggle above. Seven
        # points make a bad line chart, and a 7-day moving average over
        # exactly 7 days collapses to a single number — it would put back
        # the unreadable thing the chart replaced. "How was my week" is a
        # SUMMARY question, not a trend question, so it gets a sentence.
        #
        # This is also what the deleted "WEEK 43/100" line should always
        # have been: facts you can act on ("3 of 7 days on target") rather
        # than a score you can't ("43").
        self.week_lbl = tk.Label(trend_block, text="", bg=PILL_BG,
                                 fg=CARD_MUT, font=F_XS, anchor="w")
        self.week_lbl.grid(row=1, column=0, sticky="ew", padx=SP3, pady=(1, 0))

        self.trend_cv = tk.Canvas(trend_block, height=96, bg=PILL_BG,
                                  highlightthickness=0)
        self.trend_cv.grid(row=2, column=0, sticky="ew", padx=SP3, pady=(1, 2))
        self.trend_cv.bind("<Configure>", lambda e: self._draw_trend())
        self.trend_cv.bind("<Motion>", self._trend_hover)
        self.trend_cv.bind("<Leave>", lambda e: self._draw_trend())

        # Capacity-aware insight — computed purely from this user's own
        # historical session timestamps (see _capacity_insight); blank
        # until there's enough real data to say something honest.
        self.capacity_lbl = tk.Label(trend_block, text="", bg=PILL_BG,
                                     fg=self.T("GREEN"), font=F_XS, anchor="w")
        self.capacity_lbl.grid(row=3, column=0, sticky="ew", padx=SP3, pady=(0, 5))
        self.after(300, self._update_insights)

        # The Music (🎧) and + Tools pill row was removed on request — no
        # current use for either. The real tools menu (export, streak,
        # weekly review) still lives under the ⚙ corner gear
        # (_mk_corner_settings_btn / _show_tools_menu), which always
        # passes its own button as the anchor, so it doesn't depend on
        # self._tools_btn_ref. _music_play and _show_empty_tools_menu
        # are left defined but now unreachable, same "dead weight over
        # ripping out a whole method" tradeoff as the work timer removal
        # above.

        # Placeholder vars
        DEFAULT_WORK_MOTTO = "5 HOURS CONSISTENT FOCUSED WORK"
        saved_work_motto = self.vision_data.get("_work_motto_text", DEFAULT_WORK_MOTTO)
        self._work_motto_var = tk.StringVar(value=saved_work_motto)

        def _save_work_motto(e=None):
            self.vision_data["_work_motto_text"] = self._work_motto_var.get()
            save_data(self)

        # placeholder vars so save_data() doesn't crash (panels removed)
        self._mind_title_var = tk.StringVar(
            value=self.vision_data.get(
                "_mind_title", "TODAYS BUSINESS PLAN"))
        self._opp_title_var = tk.StringVar(
            value=self.vision_data.get(
                "_opp_title", "BUSINESS OPPORTUNITY"))
        # invisible placeholder Text widgets (never shown)
        _ph_frame = tk.Frame(p, bg=bg)
        self.mind_box = tk.Text(_ph_frame)
        self.opp_box = tk.Text(_ph_frame)

        # PLAN's lower half is the REVIEW card (Mindset / Discipline /
        # Consistency), not a second copy of the task list. The daily
        # task list lives on FOCUS only — having it on both tabs meant
        # two places to look for the same four items, and PLAN is where
        # you step back and look at the week, not where you tick things
        # off. See _build_plan_review_card.
        self._build_plan_review_card(p, row)
        row += 1

    # ══════════════════════════════════════════════════════════════════
    #  PLAN review card
    #  Mindset · Discipline · Consistency · Circle · What Changed
    # ══════════════════════════════════════════════════════════════════
    def _set_plan_tab(self, v):
        if self._settings.get("plan_tab", "mindset") == v:
            return
        self._settings["plan_tab"] = v
        save_data(self)
        self._apply_theme(self._mode)     # full rebuild in same theme

    def _mindset_key(self, day=None):
        return f"__mindset_{day or str(date.today())}"

    def _consist_target(self, key):
        """Daily target MINUTES for a project. 60 by default because the
        user's own task names ('1 Hours Work On ...') already encode a
        one-hour-a-day habit as the unit of consistency."""
        try:
            return max(5, int(self._habit_data.get(f"__consist_tgt_{key}", 60)))
        except Exception:
            return 60

    def _consist_marks(self, key):
        m = self._habit_data.get(f"__consist_mark_{key}")
        return m if isinstance(m, dict) else {}

    def _consist_minutes(self, key, day):
        """Minutes worked on a project on one ISO date.

        Reads the project's OWN timer log (__ptime_<key>), which the ▶
        button on each project card writes.

        This used to guess instead: it scanned every task's timer
        sessions and counted a task toward a project when the project's
        title appeared inside the task's text. That worked for "1 Hours
        Work On Ship Spare Export" under "SHIP SPARE EXPORT" and failed
        silently for anything worded differently — a project could look
        abandoned purely because the tasks were named unlike it. With a
        real per-project clock the number is exact, so the guess is
        gone. The manual day-mark stays as an override for work done
        away from the app."""
        return int(self._proj_secs(key, day) // 60)

    def _consist_hit(self, key, day, target=None):
        """Did this project meet its daily target on `day`?"""
        if self._consist_marks(key).get(day):
            return True
        tgt = target if target is not None else self._consist_target(key)
        return self._consist_minutes(key, day) >= tgt

    def _build_plan_review_card(self, p, row):
        """PLAN's lower card: five review tabs where the daily task list
        used to be.

        The split is by QUESTION, not by data type — Mindset answers
        "what am I telling myself today", Discipline "did I hold the
        line", Consistency "which project is going quiet", Circle "which
        PERSON is going quiet", What Changed "did any of it matter".
        Execution ("what do I do in the next hour") deliberately lives
        on the FOCUS tab instead, so neither screen tries to be both."""
        cb = self.T("CARD_BG")
        t = self.T("TEXT")
        t2 = self.T("TEXT2")
        t3 = self.T("TEXT3")
        green = self.T("GREEN")
        pc = _PANEL_COLORS[self._mode]

        _sh = tk.Frame(p, bg=_SHADOW[self._mode])
        _sh.grid(row=row, column=0, sticky="nsew", padx=SP2, pady=(3, 0))
        card = tk.Frame(_sh, bg=cb)
        card.pack(fill="both", expand=True, padx=(0, 2), pady=(0, 2))
        card.columnconfigure(0, weight=1)
        card.rowconfigure(1, weight=1)      # body absorbs spare height
        p.rowconfigure(row, weight=1)

        # ── Tab row — same small text-pill pattern the Today|Tomorrow
        # switch used, so the control reads as "the thing that was here
        # before, with different contents".
        cur = self._settings.get("plan_tab", "mindset")
        tabrow = tk.Frame(card, bg=cb)
        tabrow.grid(row=0, column=0, sticky="ew", padx=SP3, pady=(6, 4))
        # THREE tabs, all on the same rhythm: daily.
        #
        # It was five, and the ceiling was the wrong question — the right
        # one turned out to be whether there were five things here at all.
        #
        #   What Changed was the SAME FEATURE as the Sunday review, built
        #   twice: "what actually changed" / "what moved the needle",
        #   "what should I have stopped" / "what stalled and why", "one
        #   thing next week" / "next week's #1 priority". A tab you must
        #   remember to open lost to a dialog that arrives by itself, so
        #   the questions moved into that dialog and the tab is gone.
        #   Its answers were already stored under __wc_<monday>; the
        #   dialog reads and writes those same keys, so nothing typed
        #   before this change is lost or orphaned.
        #
        #   Circle is a LIST, not a form — you look at it, you don't fill
        #   it in daily — and "who could help" is nearly always a
        #   question about one project. It moved onto the project page.
        #
        # What's left is three things you'd genuinely check today, which
        # is also few enough that the ones you aren't looking at are only
        # two clicks away instead of four.
        for _i, (_k, _lbl) in enumerate((("mindset", "Mindset"),
                                         ("discipline", "Discipline"),
                                         ("consistency", "Consistency"))):
            _on = (cur == _k)
            _b = tk.Button(tabrow, text=_lbl,
                           command=lambda k=_k: self._set_plan_tab(k),
                           bg=green if _on else cb,
                           fg=_ink(green) if _on else t2,
                           font=F_XS, relief="flat", bd=0, cursor="hand2",
                           padx=SP2, pady=3,
                           activebackground=green if _on else cb,
                           activeforeground=_ink(green) if _on else green)
            _b.grid(row=0, column=_i, padx=(0 if _i == 0 else 3, 0))
            if not _on:
                _hover(_b, cb, pc["active_btn"])

        # ── Permanent door to the weekly review ──────────────────────────
        # BUG THIS FIXES: moving What Changed into the Sunday dialog also
        # moved the EARLIER WEEKS history in there — and that dialog
        # appears one day a week, and not at all once you've completed
        # that week. So six days out of seven there was no way to read
        # your own answers back, and no way to write them on a Monday if
        # Sunday had been busy. A prompt that arrives on its own is good;
        # a prompt that is the ONLY way in is not.
        # ── Two permanent doors, longest horizon first ───────────────────
        # 90-day plan sits LEFT of the weekly review because that is the
        # order they are used in: the quarter's outcome is what the week
        # is supposed to move, so a review with no plan behind it is just
        # a diary. The quarter link also carries its own progress —
        # "2/6 · 78d" — so the plan can nag from the panel without
        # opening anything.
        tabrow.columnconfigure(_i + 1, weight=1)
        _links = tk.Frame(tabrow, bg=cb)
        _links.grid(row=0, column=_i + 2, sticky="e")

        _qn, _qt = self._q90_counts()
        _qday, _qtot, _qleft = self._cycle_progress()
        _qp = tk.Button(
            _links, text=("%d-day plan  %d/%d · starts in %dd  ›"
                          % (_qtot, _qn, _qt, _qleft - _qtot)) if _qday == 0
            else ("%d-day plan  %d/%d · %dd left  ›" % (_qtot, _qn, _qt,
                                                        _qleft)),
            command=self._show_quarter_plan,
            bg=cb, fg=t2 if _qn else green, font=F_XS, relief="flat",
            bd=0, cursor="hand2", padx=SP2, pady=1, highlightthickness=0,
            activebackground=cb, activeforeground=green)
        _qp.pack(side="left")
        _hover(_qp, cb, pc["active_btn"], t2 if _qn else green, green)

        # The weekly review used to sit here. Removed on request — but
        # its answers are NOT deleted: every "__wc_<monday>" entry stays
        # in habit_data exactly as typed, so nothing anyone wrote is
        # gone, and restoring the door is a one-line change.

        body = tk.Frame(card, bg=cb)
        body.grid(row=1, column=0, sticky="nsew", padx=SP3, pady=(0, SP3))
        body.columnconfigure(0, weight=1)
        body.rowconfigure(0, weight=1)

        # "circle"/"changed" fall through to Mindset rather than to a
        # blank panel: both are still valid values of the saved
        # plan_tab setting for anyone whose app remembered one of them
        # as the last tab open before they were removed.
        if cur == "discipline":
            self._plan_tab_discipline(body, cb, t, t2, t3, green, pc)
        elif cur == "consistency":
            self._plan_tab_consistency(body, cb, t, t2, t3, green, pc)
        else:
            self._plan_tab_mindset(body, cb, t, t2, t3, green, pc)

    def _plan_scroll_host(self, parent, cb):
        """Scrollable inner frame — the three tabs all overflow on a
        narrow panel, and clipping a habit list or half the projects
        would silently hide data the tab exists to show."""
        canvas = tk.Canvas(parent, bg=cb, highlightthickness=0, bd=0)
        canvas.grid(row=0, column=0, sticky="nsew")
        sb = tk.Scrollbar(parent, orient="vertical", width=8,
                          command=canvas.yview)
        _style_sb(sb, cb, _blend(cb, self.T("TEXT3"), 0.5))
        sb.grid(row=0, column=1, sticky="ns")
        canvas.configure(yscrollcommand=sb.set)
        inner = tk.Frame(canvas, bg=cb)
        inner.columnconfigure(0, weight=1)
        win_id = canvas.create_window((0, 0), window=inner, anchor="nw")
        inner.bind("<Configure>",
                   lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.bind("<Configure>",
                    lambda e: canvas.itemconfig(win_id, width=e.width))
        return inner

    # ── Tab 1 · Mindset ───────────────────────────────────────────────
    def _plan_tab_mindset(self, body, cb, t, t2, t3, green, pc):
        """Today's intention, plus the last 7 days of them.

        The history is the point. A single note box is just a scratchpad
        you overwrite every morning; seven of them next to each other is
        the only way to notice you've written 'stop procrastinating on
        the export docs' five days running."""
        import datetime as _dt
        inner = self._plan_scroll_host(body, cb)

        tk.Label(inner, text="TODAY'S MINDSET", bg=cb, fg=pc["hdr_gold"],
                 font=F_XS, anchor="w").grid(row=0, column=0, sticky="ew",
                                             pady=(2, 3))

        key = self._mindset_key()
        box = tk.Text(inner, height=6, bg=pc["note_bg"], fg=t,
                      font=F_SMALL, relief="flat", bd=0,
                      insertbackground=green, highlightthickness=1,
                      highlightbackground=pc["border"],
                      highlightcolor=green, wrap="word",
                      padx=SP3, pady=SP2)
        box.insert("1.0", self._habit_data.get(key, ""))
        box.grid(row=1, column=0, sticky="ew")

        def _save(e=None, _b=box, _k=key):
            self._habit_data[_k] = _b.get("1.0", "end-1c")
            save_data(self)
        box.bind("<FocusOut>", _save)
        box.bind("<KeyRelease>", lambda e: self._debounced_save(
            "mindset_note", 500, _save, box))

        # ── Last 7 days ───────────────────────────────────────────────
        prev = tk.Frame(inner, bg=cb)
        prev.grid(row=2, column=0, sticky="ew", pady=(SP3, 0))
        prev.columnconfigure(1, weight=1)
        tk.Label(prev, text="RECENT", bg=cb, fg=t3, font=F_XS,
                 anchor="w").grid(row=0, column=0, columnspan=2,
                                  sticky="ew", pady=(0, 3))
        r = 1
        for i in range(1, 8):
            d = date.today() - _dt.timedelta(days=i)
            txt = (self._habit_data.get(self._mindset_key(str(d)), "") or "").strip()
            if not txt:
                continue
            tk.Label(prev, text=d.strftime("%a %d"), bg=cb, fg=t3,
                     font=F_XS, anchor="nw", width=7
                     ).grid(row=r, column=0, sticky="nw", pady=(0, 4))
            tk.Label(prev, text=txt, bg=cb, fg=t2, font=F_XS,
                     anchor="nw", justify="left", wraplength=380
                     ).grid(row=r, column=1, sticky="ew", pady=(0, 4))
            r += 1
        if r == 1:
            tk.Label(prev, text="Nothing yet — tomorrow this fills in.",
                     bg=cb, fg=t3, font=F_XS, anchor="w"
                     ).grid(row=1, column=0, columnspan=2, sticky="ew")

    # ── Tab 2 · Discipline ────────────────────────────────────────────
    def _plan_tab_discipline(self, body, cb, t, t2, t3, green, pc):
        """The daily habit checklist, surfaced from the Life Execution
        Dashboard window into the tab you actually have open all day.
        Same data, same keys — this is a second door to one room, not a
        second room."""
        inner = self._plan_scroll_host(body, cb)
        today = str(date.today())

        done, total = self._habit_day_counts(today)
        streak = self._habit_streak()

        hdr = tk.Frame(inner, bg=cb)
        hdr.grid(row=0, column=0, sticky="ew", pady=(2, 6))
        hdr.columnconfigure(1, weight=1)
        tk.Label(hdr, text=f"{done}/{total} today", bg=cb, fg=pc["hdr_gold"],
                 font=F_SMALL_B, anchor="w").grid(row=0, column=0, sticky="w")
        # Streak only appears once there IS one — a permanent "0 day
        # streak" label is a daily reminder of failure, which is the
        # opposite of what a habit tracker is for.
        if streak > 0:
            tk.Label(hdr, text=f"{streak} day streak", bg=cb, fg=t2,
                     font=F_XS, anchor="e").grid(row=0, column=2, sticky="e")

        r = 1
        for label, cat in _HABIT_CATS:
            tk.Label(inner, text=label, bg=cb, fg=t2, font=F_XS,
                     anchor="w").grid(row=r, column=0, sticky="ew",
                                      pady=(SP2, 2))
            r += 1
            for name in self._habits_for(cat):
                on = self._habit_state(today, cat, name)
                rowf = tk.Frame(inner, bg=cb, cursor="hand2")
                rowf.grid(row=r, column=0, sticky="ew")
                rowf.columnconfigure(1, weight=1)
                mark = tk.Label(rowf, text="✓" if on else "○", bg=cb,
                                fg=self.T("DONE_GREEN") if on else t3,
                                font=F_SMALL, width=2)
                mark.grid(row=0, column=0, sticky="w")
                lab = tk.Label(rowf, text=name, bg=cb,
                               fg=t3 if on else t, font=F_XS, anchor="w")
                lab.grid(row=0, column=1, sticky="ew")

                def _hit(e=None, _c=cat, _n=name, _m=mark, _l=lab):
                    now = self._habit_toggle(today, _c, _n)
                    _m.config(text="✓" if now else "○",
                              fg=self.T("DONE_GREEN") if now else t3)
                    _l.config(fg=t3 if now else t)
                    d2, t2c = self._habit_day_counts(today)
                    try:
                        hdr.winfo_children()[0].config(text=f"{d2}/{t2c} today")
                    except Exception as _e:
                        log.debug("suppressed: %s", _e)
                for w in (rowf, mark, lab):
                    w.bind("<Button-1>", _hit)
                r += 1

    # ── Tab 3 · Consistency ───────────────────────────────────────────
    def _plan_tab_consistency(self, body, cb, t, t2, t3, green, pc):
        """Per-project 30-day grid, streak, and days since the last HIT.

        Deliberately NOT a percentage score. '71% consistent' is a fact
        you can't act on; 'LEATHER PRODUCT — last hit 5 days ago' is one
        you can, this afternoon. Every element here is chosen to surface
        a GAP rather than to grade the past.

        "Hit" throughout means the daily target was met — not that the
        project was touched. The two are different, and the status line
        below says which is which, because conflating them had the tab
        telling a user who worked sixteen minutes that they had not
        worked at all."""
        import datetime as _dt
        inner = self._plan_scroll_host(body, cb)
        today = date.today()
        days = [today - _dt.timedelta(days=i) for i in range(29, -1, -1)]

        r = 0
        shown = 0
        for cfg in self._project_cfgs():
            key = cfg["key"]
            title = ((self.vision_data.get(key, {}) or {}).get("title")
                     or "").strip()
            if not title:
                continue      # unnamed project slot — nothing to track
            shown += 1
            acc = cfg["accent"]
            tgt = self._consist_target(key)

            # Minutes computed ONCE per day here, not re-derived inside
            # the cell loop and again inside each tooltip — every call
            # rescans every session of every task, so the naive version
            # was doing that 60x per project on every panel rebuild.
            marks = self._consist_marks(key)
            mins = [self._consist_minutes(key, str(d)) for d in days]
            hits = [bool(marks.get(str(d))) or mins[i] >= tgt
                    for i, d in enumerate(days)]

            # streak = consecutive hits counting back from today
            streak = 0
            for h in reversed(hits):
                if not h:
                    break
                streak += 1
            # days since last hit (None = never in this window)
            gap = None
            for i, h in enumerate(reversed(hits)):
                if h:
                    gap = i
                    break

            block = tk.Frame(inner, bg=cb)
            block.grid(row=r, column=0, sticky="ew", pady=(SP2, SP3))
            block.columnconfigure(0, weight=1)
            r += 1

            top = tk.Frame(block, bg=cb)
            top.grid(row=0, column=0, sticky="ew")
            top.columnconfigure(1, weight=1)
            tk.Frame(top, bg=acc, width=3, height=12).grid(row=0, column=0,
                                                           sticky="ns",
                                                           padx=(0, 6))
            tk.Label(top, text=title, bg=cb, fg=t, font=F_SMALL_B,
                     anchor="w").grid(row=0, column=1, sticky="ew")

            # The status line is the actual product of this tab — so it
            # has to be TRUE.
            #
            # `hits` means the daily TARGET was met, not that the project
            # was touched. Wording all of it as "worked" made the tab lie
            # in the one direction that matters: sixteen minutes on a
            # 75-minute target reported as "not worked in 30 days". That
            # is false, and it is false in the discouraging direction —
            # the app telling someone who showed up that they did not.
            #
            # Three states now, because there are three:
            #   hit the target        → the streak language
            #   showed up, fell short → say so, and say how much
            #   genuinely nothing     → "not worked"
            _touched = [i for i, d in enumerate(days)
                        if self._consist_minutes(key, str(d)) > 0]
            _last_touch = (len(days) - 1 - _touched[-1]) if _touched else None
            if gap == 0:
                status, scol = f"today ✓  ·  {streak}d streak", self.T("DONE_GREEN")
            elif gap is None and _last_touch is None:
                status, scol = "not worked in 30 days", self.T("RED")
            elif gap is None:
                _m = self._consist_minutes(key, str(days[_touched[-1]]))
                status, scol = ("%dm %s  ·  target never met"
                                % (_m, "today" if _last_touch == 0
                                   else "%dd ago" % _last_touch),
                                self.T("YELLOW"))
            elif gap >= 3:
                status, scol = f"last hit {gap} days ago", self.T("RED")
            else:
                status, scol = f"last hit {gap} day{'s' if gap > 1 else ''} ago", t2
            tk.Label(top, text=status, bg=cb, fg=scol, font=F_XS,
                     anchor="e").grid(row=0, column=2, sticky="e")

            # ── 30-day strip — one small square per day, click to
            # mark/unmark by hand when a day was worked away from the app.
            #
            # ONE row, not two of fifteen. Each project block is then
            # about half as tall, so four or five projects fit on screen
            # together instead of two — and comparing projects is the
            # whole point of this tab. A single unbroken run of days also
            # reads as a timeline, which a 15+15 wrap does not: in the
            # wrapped version the gap between the end of row one and the
            # start of row two was a jump backwards in reading order but
            # forwards in time.
            grid = tk.Frame(block, bg=cb)
            grid.grid(row=1, column=0, sticky="w", pady=(4, 2))
            for i, d in enumerate(days):
                ds = str(d)
                on = hits[i]
                cell = tk.Frame(grid, bg=acc if on else pc["pb_empty"],
                                width=9, height=13, cursor="hand2",
                                highlightthickness=1,
                                highlightbackground=(acc if on
                                                     else pc["border"]))
                cell.grid(row=0, column=i, padx=1, pady=1)
                cell.grid_propagate(False)

                # Clicking toggles the MANUAL mark only, and the cell
                # then shows (manual OR automatic). So a day the timer
                # already proved you worked stays filled even if you
                # click it — you can't un-record real work, you can only
                # add days the substring match missed.
                def _toggle(e=None, _k=key, _ds=ds, _c=cell, _a=acc,
                            _auto=(mins[i] >= tgt)):
                    m = dict(self._consist_marks(_k))
                    if m.get(_ds):
                        m.pop(_ds, None)
                    else:
                        m[_ds] = True
                    self._habit_data[f"__consist_mark_{_k}"] = m
                    save_data(self)
                    nowon = bool(m.get(_ds)) or _auto
                    _c.config(bg=_a if nowon else pc["pb_empty"],
                              highlightbackground=_a if nowon
                              else pc["border"])
                cell.bind("<Button-1>", _toggle)
                _add_tooltip(cell, f"{d.strftime('%a %d %b')} — "
                                   f"{mins[i]} min")

            # ── Daily target stepper
            tgtrow = tk.Frame(block, bg=cb)
            tgtrow.grid(row=2, column=0, sticky="w")
            tk.Label(tgtrow, text="daily target", bg=cb, fg=t3,
                     font=F_XS).grid(row=0, column=0, padx=(0, 4))
            tvar = tk.StringVar(value=str(tgt))
            tlbl = tk.Label(tgtrow, textvariable=tvar, bg=pc["input_bg"],
                            fg=t2, font=F_XS, padx=SP2)

            def _bump(delta, _k=key, _v=tvar):
                cur = self._consist_target(_k)
                new = max(5, min(600, cur + delta))
                self._habit_data[f"__consist_tgt_{_k}"] = new
                _v.set(str(new))
                save_data(self)
                # Keep the project card's "0m / 30m" readout and the
                # segmented TODAY PROGRESS bar (whose goal is the SUM of
                # these targets) in step with the change.
                self._refresh_project_time_label(_k)
                try:
                    self._update_progress_bar()
                except Exception as _e:
                    log.debug("target bump bar: %s", _e)
            for ci, (txt, dl) in enumerate((("−", -15), ("+", 15))):
                # BUG FIX: this lambda used to close over `_bump` BY NAME.
                # _bump is redefined on every pass of the enclosing
                # per-project loop, so by the time any button was clicked
                # the name resolved to the LAST project's version — every
                # +/- in the list edited project 6 and left the row you
                # actually clicked unchanged, which read as "the buttons
                # do nothing". Capturing it as a default argument freezes
                # the right one per row.
                b = tk.Button(tgtrow, text=txt, bg=pc["ctrl_bg"], fg=t2,
                              font=F_XS, relief="flat", bd=0, cursor="hand2",
                              padx=5, pady=0,
                              command=lambda d=dl, f=_bump: f(d))
                b.grid(row=0, column=1 + ci * 2, padx=1)
                _hover(b, pc["ctrl_bg"], pc["active_btn"])
            tlbl.grid(row=0, column=2, padx=2)
            tk.Label(tgtrow, text="min", bg=cb, fg=t3, font=F_XS
                     ).grid(row=0, column=4, padx=(4, 0))

        if shown == 0:
            tk.Label(inner, text="Name a project in panel 2 and it will "
                                 "start tracking here.",
                     bg=cb, fg=t3, font=F_XS, anchor="w", justify="left",
                     wraplength=380).grid(row=0, column=0, sticky="ew",
                                          pady=SP3)

    # ── Tab 4 · Circle ────────────────────────────────────────────────
    # Consistency's gap logic, pointed at people instead of projects.
    # A habit checkbox ("Family time ✓") proves you ticked a box; "Mum —
    # 9 days" proves nothing happened, and that is the thing worth
    # knowing. No score, no streak, no leaderboard of friendship — just
    # who has gone quiet, sorted worst-first.
    _CIRCLE_CADENCES = (1, 3, 7, 14, 30)

    # Circle is PER PROJECT (key "__circle_<projkey>"), not global.
    #
    # It used to be one shared list on a PLAN tab, but "who is going
    # quiet" is nearly always a question about one piece of work — the
    # supplier matters while the shipping project is live and not
    # otherwise. Asked next to the project, the answer is actionable;
    # asked in the abstract it is just a contact list.
    #
    # The old global list is NOT migrated and NOT deleted. It is still
    # read by _circle_people(None) and shown on every project page as an
    # "unassigned" group with a one-click move, so a name that was
    # already there can never quietly vanish because the feature moved.
    def _circle_people(self, pkey=None):
        p = self._habit_data.get("__circle_%s" % pkey if pkey else "__circle")
        return p if isinstance(p, list) else []

    def _circle_save(self, people, pkey=None):
        self._habit_data["__circle_%s" % pkey if pkey else "__circle"] = people
        save_data(self)

    def _circle_adopt(self, person_id, pkey):
        """Move one person off the legacy global list onto a project."""
        legacy = self._circle_people()
        who = next((p for p in legacy if p.get("id") == person_id), None)
        if who is None:
            return
        self._circle_save([p for p in legacy if p.get("id") != person_id])
        mine = self._circle_people(pkey)
        mine.append(who)
        self._circle_save(mine, pkey)

    def _plan_rebuild(self):
        """Rebuild the panels after a Circle edit.

        Deferred by one event-loop turn on purpose: every caller is an
        Entry/Button callback whose own widget the rebuild destroys, and
        tearing down the widget that is still dispatching the current
        event is how you get a stale-window TclError. after(0) lets the
        event finish first."""
        self.after(0, lambda: self.winfo_exists()
                   and self._apply_theme(self._mode))

    def _circle_gap(self, person):
        """Days since last contact — None if never recorded."""
        import datetime as _dt
        last = person.get("last")
        if not last:
            return None
        try:
            d = _dt.datetime.strptime(last, "%Y-%m-%d").date()
        except Exception:
            return None
        return max(0, (date.today() - d).days)

    def _build_circle_section(self, inner, pkey, cb, t, t2, t3, green, pc,
                              rebuild=None):
        """The people list for ONE project.

        Generalised out of the old PLAN tab so it can live on the
        project page. `inner` is any frame with column 0 weighted;
        `rebuild` is how the host redraws itself after an add or a
        remove — the PLAN tab used a whole-app theme rebuild, which a
        project window must not do to itself."""
        rebuild = rebuild or self._plan_rebuild
        people = self._circle_people(pkey)

        # ── Add a person ──────────────────────────────────────────────
        addrow = tk.Frame(inner, bg=cb)
        addrow.grid(row=0, column=0, sticky="ew", pady=(2, SP2))
        addrow.columnconfigure(0, weight=1)
        nvar = tk.StringVar()
        ent = tk.Entry(addrow, textvariable=nvar, bg=pc["input_bg"],
                       fg=pc["input_fg"], font=F_XS, relief="flat", bd=0,
                       insertbackground=green, highlightthickness=1,
                       highlightbackground=pc["border"],
                       highlightcolor=green)
        ent.grid(row=0, column=0, sticky="ew", ipady=4, padx=(0, 4))

        def _add(e=None):
            nm = nvar.get().strip()
            if not nm:
                return
            ppl = self._circle_people(pkey)
            ppl.append({"id": int(time.time() * 1000), "name": nm,
                        "cadence": 7, "last": ""})
            self._circle_save(ppl, pkey)
            nvar.set("")
            rebuild()
        ent.bind("<Return>", _add)
        ab = tk.Button(addrow, text="+ add", command=_add, bg=green,
                       fg="#FFFFFF", font=F_XS, relief="flat", bd=0,
                       cursor="hand2", padx=SP2, pady=2,
                       activebackground=green, activeforeground="#FFFFFF")
        ab.grid(row=0, column=1)
        self._press_depth(ab)

        r = 1
        if not people:
            # NOTE: no early return here.
            #
            # There was one, and it hid the "not yet on a project" block
            # below — so on a project with nobody added yet, which is
            # every project the first time you open it, the names
            # carried over from the old shared list were invisible.
            # The one screen that had to show them was the only screen
            # that didn't.
            tk.Label(inner, text="Who does this project actually depend on? "
                                 "The supplier, the buyer, the one person "
                                 "who can unblock it.",
                     bg=cb, fg=t3, font=F_XS, anchor="w", justify="left",
                     wraplength=380).grid(row=1, column=0, sticky="ew",
                                          pady=SP3)
            r = 2

        # Worst-first. The whole point of the tab is the person you have
        # NOT spoken to, so they must not be at the bottom of a list you
        # stop reading halfway down. Never-contacted sorts to the very
        # top (gap None -> +inf).
        def _sortkey(pn):
            g = self._circle_gap(pn)
            over = (g if g is not None else 10 ** 6) - int(pn.get("cadence", 7))
            return -over
        for person in sorted(people, key=_sortkey):
            gap = self._circle_gap(person)
            cad = int(person.get("cadence", 7))
            overdue = gap is None or gap > cad

            rowf = tk.Frame(inner, bg=cb)
            rowf.grid(row=r, column=0, sticky="ew", pady=(0, 5))
            rowf.columnconfigure(1, weight=1)
            r += 1

            dot_col = self.T("RED") if overdue else self.T("DONE_GREEN")
            dot = tk.Frame(rowf, bg=dot_col, width=3, height=14)
            dot.grid(row=0, column=0, sticky="ns", padx=(0, 6))
            tk.Label(rowf, text=person.get("name", ""), bg=cb, fg=t,
                     font=F_SMALL_B, anchor="w").grid(row=0, column=1,
                                                      sticky="ew")

            def _gap_text(g):
                if g is None:
                    return "never"
                if g == 0:
                    return "today"
                if g == 1:
                    return "yesterday"
                return f"{g} days ago"
            gap_lbl = tk.Label(rowf, text=_gap_text(gap), bg=cb,
                               fg=self.T("RED") if overdue else t2,
                               font=F_XS)
            gap_lbl.grid(row=0, column=2, padx=(4, 6))

            def _repaint(_g, _cad, _d=dot, _gl=gap_lbl, _gt=_gap_text):
                od = _g is None or _g > _cad
                col = self.T("RED") if od else self.T("DONE_GREEN")
                _d.config(bg=col)
                _gl.config(text=_gt(_g), fg=self.T("RED") if od else t2)

            # Cadence chip — click cycles 1/3/7/14/30 days. "How often
            # is often enough" is different for a parent and a supplier,
            # and without it every row would be permanently red or
            # permanently green.
            cd_lbl = tk.Label(rowf, text=f"{cad}d", bg=pc["ctrl_bg"], fg=t3,
                              font=F_XS, padx=4, cursor="hand2")
            cd_lbl.grid(row=0, column=3, padx=(0, 4))

            # Cadence and "spoke today" update the row IN PLACE rather
            # than rebuilding the panel. A rebuild goes through
            # _apply_theme, which closes and reopens every open
            # sub-window — losing someone's Business Analysis window
            # because they ticked off a phone call is not a trade worth
            # making. It also means rows don't re-sort out from under
            # the cursor mid-click; the worst-first order refreshes next
            # time the tab is opened, which is soon enough.
            def _cycle(e=None, _pid=person.get("id"), _l=cd_lbl,
                       _rp=_repaint):
                ppl = self._circle_people(pkey)
                for pn in ppl:
                    if pn.get("id") == _pid:
                        cur = int(pn.get("cadence", 7))
                        opts = self._CIRCLE_CADENCES
                        nxt = opts[(opts.index(cur) + 1) % len(opts)] \
                            if cur in opts else 7
                        pn["cadence"] = nxt
                        _l.config(text=f"{nxt}d")
                        _rp(self._circle_gap(pn), nxt)
                        break
                self._circle_save(ppl, pkey)
            cd_lbl.bind("<Button-1>", _cycle)
            _add_tooltip(cd_lbl, "How often you want to be in touch — "
                                 "click to change")

            def _touch(_pid=person.get("id"), _rp=_repaint):
                ppl = self._circle_people(pkey)
                for pn in ppl:
                    if pn.get("id") == _pid:
                        pn["last"] = str(date.today())
                        _rp(0, int(pn.get("cadence", 7)))
                        break
                self._circle_save(ppl, pkey)
            tb = tk.Button(rowf, text="✓ today", command=_touch,
                           bg=pc["ctrl_bg"], fg=t2, font=F_XS, relief="flat",
                           bd=0, cursor="hand2", padx=SP2, pady=0)
            tb.grid(row=0, column=4)
            _hover(tb, pc["ctrl_bg"], pc["active_btn"])
            _add_tooltip(tb, "Mark that you spoke today")

            def _rm(_pid=person.get("id")):
                self._circle_save([pn for pn in self._circle_people(pkey)
                                   if pn.get("id") != _pid], pkey)
                rebuild()
            xb = tk.Button(rowf, text="✕", command=_rm, bg=cb, fg=t3,
                           font=F_XS, relief="flat", bd=0, cursor="hand2",
                           padx=3, pady=0)
            xb.grid(row=0, column=5, padx=(2, 0))
            _hover(xb, cb, cb, t3, pc["del_hover"])

        # ── Names left over from the old shared list ──────────────────
        # Circle used to be one global list on a PLAN tab. Rather than
        # guess which project each of those people belonged to — every
        # guess would be wrong for someone — they stay exactly where
        # they were and appear here until they are placed by hand. The
        # block disappears on its own once the old list is empty, so it
        # is a migration that costs one click per person and cannot
        # lose anybody.
        legacy = self._circle_people()
        if legacy:
            lf = tk.Frame(inner, bg=cb)
            lf.grid(row=r, column=0, sticky="ew", pady=(SP3, 0))
            lf.columnconfigure(0, weight=1)
            tk.Label(lf, text="NOT YET ON A PROJECT", bg=cb, fg=t3,
                     font=F_XS, anchor="w").grid(row=0, column=0,
                                                 sticky="ew", pady=(0, 3))
            for _i, _pn in enumerate(legacy, start=1):
                _lr = tk.Frame(lf, bg=cb)
                _lr.grid(row=_i, column=0, sticky="ew", pady=(0, 3))
                _lr.columnconfigure(0, weight=1)
                tk.Label(_lr, text=_pn.get("name", ""), bg=cb, fg=t2,
                         font=F_XS, anchor="w").grid(row=0, column=0,
                                                     sticky="ew")

                def _adopt(_pid=_pn.get("id")):
                    self._circle_adopt(_pid, pkey)
                    rebuild()
                _mb = tk.Button(_lr, text="move here", command=_adopt,
                                bg=cb, fg=green, font=F_XS, relief="flat",
                                bd=0, cursor="hand2", padx=SP2, pady=0,
                                highlightthickness=0, activebackground=cb,
                                activeforeground=green)
                _mb.grid(row=0, column=1)
                _hover(_mb, cb, pc["active_btn"], green, green)

    # ── Tab 5 · What Changed ──────────────────────────────────────────
    # The only tab that asks about OUTPUT. Mindset/Discipline/
    # Consistency/Circle all measure effort, and a month of perfect
    # effort with nothing to show for it means the plan is wrong — which
    # none of the other four can ever tell you.
    #
    # Weekly, not daily, and deliberately NOT called "10x". Asking "did
    # I get 10x better today" has one honest answer every single day, and
    # a tab that makes you feel like a failure on open is a tab you stop
    # opening. Three questions is also a hard limit: a longer review is
    # one nobody fills in.
    # ══════════════════════════════════════════════════════════════════
    #  THE PLAN — six areas of a life, one cycle at a time
    # ══════════════════════════════════════════════════════════════════
    # Six areas, because the point is a WHOLE life and a list you can
    # still finish. Craft/career is deliberately absent: that is what
    # panel 1's six projects and their goals already are, and a plan that
    # asks the same question twice gets two different answers.
    _Q90_AREAS = (
        ("appearance", "Appearance", "\u25c8",
         "How you show up \u2014 body, grooming, clothes, posture."),
        ("money", "Money", "\u25c9",
         "Earned, saved, owed. The number, not the feeling."),
        ("relationship", "Relationship", "\u2756",
         "The one closest person. Partner, or the one who matters most."),
        ("health", "Health", "\u25d0",
         "Sleep, food, movement, the check-up you keep postponing."),
        ("social", "Friends \u00b7 Family \u00b7 Social", "\u25c7",
         "The people who would notice if you disappeared for a month."),
        ("mind", "Mind \u00b7 Skill", "\u25ce",
         "What you are learning, and what you want to be able to do."),
    )

    # The three questions are not a form, they are a method.
    #
    #   OUTCOME  \u2014 goal-setting research is consistent on one thing:
    #              specific and measurable beats "do your best". "Get
    #              fitter" cannot be true or false in 90 days; "run 5km
    #              without stopping" can.
    #   ACTION   \u2014 the outcome is the destination, this is the vehicle.
    #              One repeating behaviour, sized for your WORST week,
    #              because a plan that only survives good weeks is a plan
    #              you abandon in week three.
    #   IF-THEN  \u2014 mental contrasting plus an implementation intention:
    #              name the obstacle you already know is coming and
    #              decide the response NOW, while it is cheap. Deciding
    #              in the moment is what willpower is spent on; deciding
    #              in advance is free.
    # "{n}" is the cycle length. It was the literal number 90, which
    # went wrong the moment the cycle became settable: a 30-day plan
    # asked what would be true in 90 days, so the one question the whole
    # method rests on was measuring against a deadline that did not
    # exist.
    # The fourth item is how many lines the box shows. Not all three
    # questions want the same room: the outcome and the weekly action are
    # where you think on paper and cross things out, but an if-then is
    # one sentence by construction — "if X, then Y" — and a six-line box
    # under it just asks you to pad. Three is enough for the longest
    # honest answer and gives the height back to the screen.
    _Q90_PROMPTS = (
        ("out", "In {n} days, what is measurably true?",
         "A number or a yes/no. Not \u201cbetter\u201d \u2014 "
         "\u201c72kg\u201d, \u201cvisa submitted\u201d.", 6),
        ("act", "The ONE thing you repeat every week",
         "The behaviour, not the wish. Small enough for your worst week.",
         6),
        ("ifthen", "When it goes wrong, what will you do?",
         "Name what usually stops you, and decide the answer now.", 3),
    )

    CYCLE_PRESETS = (30, 60, 90)
    CYCLE_MIN, CYCLE_MAX = 7, 365

    def _cycle_span(self, d=None):
        """(start, end) of the plan cycle that contains `d`.

        Was a fixed calendar quarter, which had the virtue of needing no
        settings and the flaw of not being anyone's actual cycle: a plan
        you start on the 12th does not want to end because September
        did. Start and length are now yours.

        Cycles REPEAT from the chosen start rather than expiring, so a
        plan left alone for four months lands you in cycle 3 with the
        right dates, instead of showing a window that closed in June.
        `d` outside the current cycle therefore still resolves to the
        cycle containing it — past or future — which is what makes an
        old cycle's answers reachable at all."""
        import datetime as _dt
        d = d or date.today()
        n = self._cycle_days()
        try:
            anchor = date.fromisoformat(
                str(self._settings.get("cycle_start") or ""))
        except Exception:
            anchor = None
        if anchor is None:
            # No cycle chosen yet: return the calendar QUARTER this app
            # used before — start and end both — so a file written by the
            # previous build opens on the same key with its answers
            # intact. Anchoring on the quarter and then stepping by `n`
            # from it is not the same thing and was wrong: it gave
            # 1 Jul \u2192 28 Sep for a 90-day default, and for an
            # unparseable start date it drifted to 31 Jul.
            _m = 3 * ((d.month - 1) // 3) + 1
            _qs = _dt.date(d.year, _m, 1)
            _ny, _nm = (d.year + 1, 1) if _m == 10 else (d.year, _m + 3)
            return _qs, _dt.date(_ny, _nm, 1) - _dt.timedelta(days=1)
        # The anchor is the FIRST cycle, never a midpoint. Cycles repeat
        # forward from it and stop dead at it going back.
        #
        # They used to resolve backwards too — mathematically tidy, and
        # wrong for a person: set the start to the 15th while today is
        # the 5th and the app would answer "day 21 of a cycle that began
        # 16 August", inventing a cycle you never planned out of a date
        # you chose precisely because it is when you intend to BEGIN. A
        # start date in the future means the plan has not started yet,
        # which _cycle_progress reports as day 0.
        if d < anchor:
            return anchor, anchor + _dt.timedelta(days=n - 1)
        start = anchor + _dt.timedelta(days=((d - anchor).days // n) * n)
        return start, start + _dt.timedelta(days=n - 1)

    @classmethod
    def _parse_cycle_len(cls, text, fallback=90):
        """Read a cycle length out of whatever is in the box.

        Returns `fallback` for anything that is not a usable number —
        empty, letters, or out of range. Pulled out of the dialog so the
        rule can be tested without a display: the preset buttons, the
        typed box and the Set-cycle handler all read the SAME value
        through this, which is what stops them disagreeing about what
        the user chose."""
        try:
            n = int(str(text).strip())
        except Exception:
            return fallback
        if not (cls.CYCLE_MIN <= n <= cls.CYCLE_MAX):
            return fallback
        return n

    def _cycle_days(self):
        """Length of a cycle in days, clamped to something a human could
        mean. A 0-day cycle divides by zero; a 5000-day one is not a
        plan."""
        try:
            n = int(self._settings.get("cycle_days", 90))
        except Exception:
            n = 90
        return max(self.CYCLE_MIN, min(self.CYCLE_MAX, n))

    def _set_cycle(self, start, days):
        """Move the cycle, carrying this cycle's answers with it.

        The answers are keyed by start date, so changing the start would
        silently point the plan at an empty key — the user would see
        their own writing vanish and have no way to know it was still on
        disk. So the entry MOVES. Nothing is deleted either way: if the
        destination already has answers, the existing ones win and the
        old key is left alone rather than overwritten."""
        old_key = self._cycle_key()
        old = self._habit_data.get(old_key)
        try:
            start = (start if isinstance(start, date)
                     else date.fromisoformat(str(start)))
        except Exception:
            return False
        days = max(self.CYCLE_MIN, min(self.CYCLE_MAX, int(days)))
        self._settings["cycle_start"] = str(start)
        self._settings["cycle_days"] = days
        new_key = self._cycle_key()
        if new_key != old_key and isinstance(old, dict) and old:
            if not isinstance(self._habit_data.get(new_key), dict) \
                    or not self._habit_data.get(new_key):
                self._habit_data[new_key] = old
                self._habit_data.pop(old_key, None)
        save_data(self)
        return True

    def _cycle_key(self, d=None):
        """Storage key for the cycle containing `d`."""
        return "__q90_" + str(self._cycle_span(d)[0])

    def _cycle_progress(self, d=None):
        """(day_number, total_days, days_left) for the cycle holding `d`.

        day is 0 when the cycle has not started yet — a plan you set to
        begin next Monday is not on day 1 today, and saying so would put
        a false number on the one part of this screen whose whole job is
        to be an honest countdown. Callers show "starts in N days" for
        day 0; N is days_left minus total."""
        d = d or date.today()
        start, end = self._cycle_span(d)
        total = (end - start).days + 1
        if d < start:
            return 0, total, total + (start - d).days
        day = min(total, (d - start).days + 1)
        return day, total, total - day

    def _q90_data(self, d=None):
        """This cycle's answers: {area: {out, act, ifthen}}."""
        cur = self._habit_data.get(self._cycle_key(d))
        return cur if isinstance(cur, dict) else {}

    def _q90_set(self, area, field, text, d=None):
        """Write one field. Whole-dict rewrite because _habit_data is
        saved wholesale and a nested mutation would not be noticed."""
        _k = self._cycle_key(d)
        cur = self._habit_data.get(_k)
        cur = dict(cur) if isinstance(cur, dict) else {}
        _a = cur.get(area)
        _a = dict(_a) if isinstance(_a, dict) else {}
        _a[field] = text
        cur[area] = _a
        self._habit_data[_k] = cur

    def _q90_counts(self, d=None):
        """(areas with an outcome written, total areas).

        Counts the OUTCOME only. An area with a weekly action but no
        outcome is a habit without a destination, and calling that
        \u201cplanned\u201d is the kind of flattering number this app
        keeps having to remove."""
        data = self._q90_data(d)
        n = sum(1 for k, _n, _g, _h in self._Q90_AREAS
                if ((data.get(k) or {}).get("out") or "").strip())
        return n, len(self._Q90_AREAS)

    def _build_task_card(self, p, row, list_key="classic"):
        """Task list card — shared by CLASSIC and FOCUS panel-3 views,
        but each view keeps its OWN independent task list, MIT, title
        and search filter (self.tasks vs self.tasks_focus)."""
        self._active_task_list = list_key
        cb = self.T("CARD_BG")
        t2 = self.T("TEXT2")
        t3 = self.T("TEXT3")
        green = self.T("GREEN")
        cborder = self.T("CARD_BORDER")
        # ── Massive Immediate Action (fills all remaining space, no card wrapper) ─────
        _tsh = tk.Frame(p, bg=_SHADOW[self._mode])
        _tsh.grid(row=row, column=0, sticky="nsew", padx=SP2, pady=(3, 0))
        row += 1
        tcard = tk.Frame(_tsh, bg=cb)
        tcard.pack(fill="both", expand=True, padx=(0, 2), pady=(0, 2))
        tcard.columnconfigure(0, weight=1)
        # Rows: 0 day-switch · 1 header · 2 inline input · 3 list.
        # The list row carries the weight so it absorbs all spare height.
        tcard.rowconfigure(3, weight=1)  # task list row
        p.rowconfigure(row - 1, weight=1)

        # Task header row: edit-icon + editable label + count. The title
        # is a section HEADING the user can rename (e.g. "MASSIVE
        # IMMEDIATE ACTION TODAY" -> a personal mantra) — it previously
        # used the same bold accent color as real task text and sat
        # directly above the list with no visual cue that it's an
        # editable label rather than a task row, which reads as a
        # stray/orphaned task especially once the list itself is empty.
        # A small pencil glyph + muted-until-focus color fixes that.
        # ── Today | Tomorrow day switch ──────────────────────────────────────
        # Only on the CLASSIC list. On the FOCUS panel the MIT tab is
        # today and the TASK LIST tab is tomorrow, so the tab already
        # answers "which day" — a second control saying the same thing
        # can only ever disagree with it. `day` is still a field on the
        # task, not a separate list (see _task_matches_day); the tab just
        # decides which value new tasks get.
        if list_key != "focus":
            _dayrow = tk.Frame(tcard, bg=cb)
            _dayrow.grid(row=0, column=0, sticky="w", padx=SP3, pady=(6, 0))
            _cur_day = getattr(self, "_task_day", "today")
            for _i, (_k, _lbl) in enumerate((("today", "Today"),
                                             ("tomorrow", "Tomorrow"))):
                _on = (_cur_day == _k)
                _b = tk.Button(_dayrow, text=_lbl,
                               command=lambda k=_k: self._set_task_day(k),
                               bg=green if _on else cb,
                               fg=_ink(green) if _on else t2,
                               font=F_XS, relief="flat", bd=0, cursor="hand2",
                               padx=SP2, pady=1,
                               activebackground=green if _on else cb,
                               activeforeground=_ink(green) if _on else green)
                _b.grid(row=0, column=_i, padx=(0 if _i == 0 else 3, 0))
                if not _on:
                    _hover(_b, cb, _PANEL_COLORS[self._mode]["active_btn"])

        task_hdr = tk.Frame(tcard, bg=cb)
        task_hdr.grid(row=1, column=0, sticky="ew", padx=SP3, pady=(2, 0))
        task_hdr.columnconfigure(1, weight=1)

        tk.Label(task_hdr, text="✎", bg=cb, fg=t3, font=F_SMALL
                 ).grid(row=0, column=0, padx=(0, 3))

        # The heading belongs to the DAY as well as the view, so Today and
        # Tomorrow each keep their own (renaming one must not rename the
        # other). Four keys in total: {classic,focus} x {today,tomorrow}.
        # CLASSIC/today deliberately keeps the original key name so a
        # heading an existing user already renamed is not orphaned.
        _tomorrow_view = getattr(self, "_task_day", "today") == "tomorrow"
        _title_key = "_task_title" if list_key == "classic" else "_task_title_focus"
        if _tomorrow_view:
            _title_key += "_tomorrow"
        # The two lists are named for what they ARE, not just where they
        # live. PLAN holds TARGETS — everything the day owes you, broad.
        # On FOCUS this card is now NEXT: the pool of candidates you
        # promote three of into the STRIKE LIST card above it. It is
        # named for its relationship to that card, because a list whose
        # only job is to feed another one should say so.
        if list_key == "focus":
            # Named for the tab it sits in, not for a day filter that is
            # no longer on screen.
            # MIT's lower half is "LIST": the pool you promote three of
            # into STRIKE above it. Two short words for two parts of one
            # tab reads as a structure; "TODAY'S OTHER TASKS" under
            # "MOST IMPORTANT TASKS" read as two unrelated cards.
            DEFAULT_TASK_TITLE = "TASK LIST" if _tomorrow_view else "LIST"
        else:
            DEFAULT_TASK_TITLE = ("TOMORROW'S TARGETS" if _tomorrow_view
                                  else "TODAY'S TARGETS")
        # A heading the user never deliberately renamed can still be
        # SAVED: the entry persists its contents on FocusOut, so merely
        # clicking into the field and away froze whatever default was
        # showing at the time into vision_data. Those frozen defaults
        # would then shadow any future default forever. So a saved value
        # that exactly equals a previous default is treated as "not
        # customised" and falls through. Anything the user actually
        # typed is untouched.
        # "STRIKE LIST" is in here because the name MOVED: this card used
        # to be the strike list, and now it's the pool you pick the
        # strike list FROM. Anyone who clicked into the heading before
        # the redesign has that old default frozen in vision_data, and
        # without this it would sit above the NEXT pool contradicting
        # the real STRIKE LIST card directly above it.
        # "TODAY'S OTHER TASKS" joins them for the same reason: it was
        # this card's default right up until MIT was split into a named
        # STRIKE half and a named LIST half, so anyone who clicked into
        # the heading in between has it frozen and would keep reading the
        # old, longer name beside the new short one above it.
        _LEGACY_DEFAULTS = {"TODAY'S TASKS", "TOMORROW'S TASKS",
                            "STRIKE LIST", "TOMORROW'S STRIKE LIST",
                            "NEXT", "TOMORROW'S PLAN",
                            "TODAY'S OTHER TASKS"}
        saved_task_title = self.vision_data.get(_title_key)
        if not saved_task_title or saved_task_title in _LEGACY_DEFAULTS:
            saved_task_title = DEFAULT_TASK_TITLE
        self._task_title_var = tk.StringVar(value=saved_task_title)
        _hdr_gold = _PANEL_COLORS[self._mode]["hdr_gold"]
        task_title_entry = tk.Entry(task_hdr, textvariable=self._task_title_var,
                                    bg=cb, fg=t2,
                                    relief="flat", font=F_SMALL_B,
                                    insertbackground=_hdr_gold,
                                    highlightthickness=0, bd=0)
        task_title_entry.grid(row=0, column=1, sticky="ew", padx=(0, 4))

        def _save_task_title(e=None):
            self.vision_data[_title_key] = self._task_title_var.get()
            save_data(self)
        # Muted "t2" normally; only switches to the accent gold while the
        # user is actually editing it, so a renamed heading doesn't read
        # as an active/urgent task item when the field isn't focused.
        task_title_entry.bind("<FocusIn>", lambda e: task_title_entry.config(fg=_hdr_gold))
        task_title_entry.bind(
            "<FocusOut>", lambda e: (
                task_title_entry.config(
                    fg=t2), _save_task_title(e)))
        task_title_entry.bind("<Return>", _save_task_title)
        task_title_entry.config(highlightthickness=1, highlightbackground=cb,
                                highlightcolor=cb)
        # Debounce key includes the day, else a pending save for Today's
        # heading could be cancelled by / land on Tomorrow's.
        task_title_entry.bind("<KeyRelease>", lambda e: self._debounced_save(
            "task_title_" + _title_key, 400,
            lambda: self.vision_data.__setitem__(
                _title_key, self._task_title_var.get()),
            task_title_entry))

        # Neutral, not accent-filled: a "0/4" count is data, not an
        # action, so it shouldn't compete with the "+ Add Task" CTA
        # sitting right next to it in the same solid accent colour —
        # same reasoning already applied to the project-card count pills
        # elsewhere (see task list item #9 from this session's review).
        # Plain text, no pill. The grey chip existed only so this count
        # would not compete with a SOLID accent "+ Add Task" beside it —
        # and that button is an outline now, which left the chip as the
        # loudest thing in a header row whose job is to be quiet. The
        # STRIKE header above states its count as plain text; two section
        # headers on one tab should not state the same kind of number in
        # two different ways.
        self.count_lbl = tk.Label(
            task_hdr, text="", bg=cb,
            fg=_PANEL_COLORS[self._mode]["sec_text"],
            font=F_SMALL_B, padx=SP2, pady=1)
        self.count_lbl.grid(row=0, column=2, padx=(4, 0))

        # + Add button — right of count, opens inline input
        # ── Outlined, not filled ──────────────────────────────────────
        # A filled accent block is this app's signal for "the primary
        # action of the screen", and on FOCUS that is START in the NOW
        # card. Four things wore it at once — the PLAN/EXECUTE tab, the
        # inner tab, START, and this — so the accent stopped meaning
        # "most important here" and started meaning "blue". Adding a task
        # is a utility you reach for between decisions, not the decision;
        # an outline says clickable without claiming the top rank.
        add_btn = tk.Button(task_hdr, text="+ Add Task",
                            bg=cb, fg=green,
                            relief="flat", font=F_SMALL_B,
                            cursor="hand2", bd=0, padx=SP2, pady=SP1,
                            highlightthickness=1, highlightbackground=green,
                            highlightcolor=green,
                            activebackground=_PANEL_COLORS[
                                self._mode]["active_btn"],
                            activeforeground=green,
                            command=self._show_task_input)
        add_btn.grid(row=0, column=3, padx=(6, 0))

        # Live search filter (per-list, so a CLASSIC term never leaks to FOCUS).
        # Two separate problems were reported here. First it was painted with
        # INPUT_BG, which drew a filled grey box that read as an orphaned
        # widget next to "+ Add Task" — hence bg=cb. But an empty bordered
        # box still says nothing about what it does, so it also gets a
        # magnifier: the icon is what makes it identifiable as a search box,
        # not the fill. A placeholder INSIDE the entry was rejected because
        # the entry's text is the live filter value — placeholder text would
        # have to be excluded from it, which is exactly how "ghost text gets
        # searched for" bugs happen.
        # ⌕ instead of 🔍 — a text glyph that takes the muted fg colour.
        tk.Label(task_hdr, text="⌕", bg=cb, fg=t3, font=F_SMALL
                 ).grid(row=0, column=4, padx=(8, 1))
        _srch = tk.Entry(task_hdr, width=8, bg=cb,
                         fg=self.T("INPUT_FG"), relief="flat", font=F_SMALL,
                         insertbackground=self.T("INPUT_FG"),
                         highlightthickness=1, highlightbackground=cborder,
                         highlightcolor=green)
        _srch.insert(0, self._task_filter.get(list_key, ""))
        _srch.grid(row=0, column=5, padx=(0, 0), ipady=1)

        def _on_filter(e=None):
            self._task_filter[list_key] = _srch.get()
            self._render_tasks()
        _srch.bind("<KeyRelease>", _on_filter)
        _srch.bind("<Escape>", lambda e: (_srch.delete(0, "end"), _on_filter()))

        # Inline input row — hidden by default, shown on + Add click
        self._task_inp_frame = tk.Frame(tcard, bg=cb)
        self._task_inp_frame.columnconfigure(0, weight=1)
        # (not gridded yet — shown on demand at row 1)
        self.task_entry = tk.Entry(self._task_inp_frame,
                                   bg=self.T("INPUT_BG"), fg=self.T("INPUT_FG"),
                                   relief="flat", font=(_FM, 11),
                                   insertbackground=self.T("INPUT_FG"),
                                   highlightthickness=1,
                                   highlightbackground=cborder,
                                   highlightcolor=green)
        self.task_entry.grid(row=0, column=0, ipady=6, sticky="ew",
                             padx=(12, 4), pady=(6, 6))
        self.task_entry.bind("<Return>", lambda e: self._add_task())
        self.task_entry.bind("<Escape>", lambda e: self._hide_task_input())
        tk.Button(self._task_inp_frame, text="✓",
                  command=self._add_task,
                  bg=green, fg="#FFFFFF", relief="flat",
                  font=F_H3, cursor="hand2", bd=0,
                  padx=SP2, pady=SP1,
                  activebackground=self.T("GREEN2"),
                  activeforeground="#fff"
                  ).grid(row=0, column=1, padx=(0, 4), pady=(6, 6))
        tk.Button(self._task_inp_frame, text="✕",
                  command=self._hide_task_input,
                  bg=self.T("INPUT_BG"), fg=t2, relief="flat",
                  font=F_BODY, cursor="hand2", bd=0,
                  padx=SP2, pady=SP1,
                  activebackground=cborder
                  ).grid(row=0, column=2, padx=(0, 12), pady=(6, 6))
        # Grid it, then immediately remove it — do NOT leave it simply
        # never-gridded.
        #
        # BUG THIS FIXES: row 2 of this card came up holding roughly one
        # task-card's worth of blank height, pushing the whole list down
        # and leaving a white strip under the NEXT header. It cleared
        # the moment you opened the add-task row and closed it again,
        # because THAT is what finally gave row 2 real grid geometry to
        # collapse. A widget Tk has never placed has no grid info for
        # its row at all; one that was placed and then removed does, and
        # a removed slave contributes zero height. Priming it here means
        # the row is correctly zero from the first frame instead of
        # after the user's first click.
        self._task_inp_frame.grid(row=2, column=0, sticky="ew")
        self._task_inp_frame.grid_remove()

        lw = tk.Frame(tcard, bg=cb)
        lw.grid(row=3, column=0, sticky="nsew", padx=SP1, pady=0)
        lw.columnconfigure(0, weight=1)
        lw.rowconfigure(0, weight=1)

        self.task_canvas = tk.Canvas(lw, bg=cb, highlightthickness=0)
        sb = tk.Scrollbar(lw, orient="vertical", command=self.task_canvas.yview)
        _style_sb(sb, cb, _blend(cb, self.T("TEXT3"), 0.5))
        self.task_canvas.configure(yscrollcommand=sb.set)
        self.task_canvas.grid(row=0, column=0, sticky="nsew")
        sb.grid(row=0, column=1, sticky="ns")
        self.task_inner = tk.Frame(self.task_canvas, bg=cb)
        self.task_inner.columnconfigure(0, weight=1)
        self._tw = self.task_canvas.create_window(
            (0, 0), window=self.task_inner, anchor="nw")
        self.task_inner.bind("<Configure>",
                             lambda e: self.task_canvas.configure(
                                 scrollregion=self.task_canvas.bbox("all")))
        self.task_canvas.bind("<Configure>",
                              lambda e: self.task_canvas.itemconfig(self._tw, width=e.width))
        self._render_tasks()

        # ── Weekly Goal section removed from UI (data preserved in JSON) ──────
        # The saved _idea_note / _idea_title remain in vision_data untouched.
        # The task list now expands to fill the freed bottom space.

    # ══════════════════════════════════════════════════════════════════════════
    # PANEL-3 FOCUS VIEW — countdown card + real Pomodoro + slim goal bar
    # ══════════════════════════════════════════════════════════════════════════
    POMO_DUR = {"focus": 25 * 60, "short": 5 * 60, "long": 15 * 60}

    def _panel3_tabs(self, p, row):
        """Two-tab switcher at the top of panel 3 — a filled segmented
        control (like an iOS/macOS segmented button), deliberately with
        NO arrow/chevron glyphs. The old version used "▶ FOCUS" — the
        exact same ▶ glyph as the panel-disclosure arrows placed in this
        same corner — so it read as "click to open something" instead of
        "click to switch view". A pill-shaped filled/unfilled pair reads
        unambiguously as a mode switch, not a directional control.

        Top padding is deliberately large (18px) — panel 3 also has two
        small corner-pinned controls (the layout arrow, top-left, and
        the Settings gear, top-right) placed with .place() directly on
        the panel, independent of this grid. Without clearance here they
        physically sit on top of the tab bar's edges (the arrow poking
        into "CLASSIC", the gear hidden under "FOCUS"). Pushing the tab
        row itself down leaves a clean strip for both at the very top."""
        bg = self.T("BG")
        acc = self.T("GREEN")
        cborder = self.T("CARD_BORDER")
        pc = _PANEL_COLORS[self._mode]
        card = pc["card2"]
        outer = tk.Frame(p, bg=bg)
        outer.grid(row=row, column=0, sticky="ew", padx=SP4, pady=(18, 3))
        track = tk.Frame(outer, bg=cborder, highlightthickness=1,
                         highlightbackground=cborder)
        track.pack(fill="x")
        track.columnconfigure(0, weight=1)
        track.columnconfigure(1, weight=1)
        cur = self._settings.get("panel3_view", "classic")
        # LABELS are "PLAN" / "FOCUS"; the stored KEYS stay
        # "classic"/"focus". Renaming a key would invalidate every
        # existing user's saved panel3_view setting for no benefit —
        # those strings are internal and never shown.
        #
        # The pair names the MODE you're in, not the widgets on screen:
        # PLAN is where you decide (day rhythm, progress, projects +
        # goals panels), FOCUS is where you execute one thing. Earlier
        # names failed that test — "CLASSIC" described the app's own
        # history, "DASHBOARD" describes a UI pattern every app has.
        # FOCUS deliberately survives both renames: it names the mental
        # state this screen protects, which is the actual promise, and
        # it's already the established word in the Pomodoro world.
        for col, (key, lbl) in enumerate(
                # No icons on the two primary tabs.
                #
                # 📋 and 🍅 were the single most visible "hobbyist" tell in
                # the whole app: colour-emoji are fixed multi-colour
                # bitmaps, so they ignore the theme's foreground colour
                # entirely — on the selected (accent-filled, white text)
                # tab they still rendered in their own clipboard-brown
                # and tomato-red, which no professional app does. They
                # also render differently on every OS. Two words in the
                # right weight say the same thing and stay themeable.
                # "FOCUS" became "EXECUTE". Two reasons beyond taste:
                # PLAN | EXECUTE is the pairing this app is actually
                # about and the one a buyer recognises on sight, and
                # "focus" was already spoken for — Ctrl+F opens "Focus
                # Mode", which is the panel collapse, an unrelated
                # thing that happened to share the word.
                # The stored KEY stays "focus" (see above) so no saved
                # file is invalidated by a label change.
                (("classic", "PLAN"), ("focus", "EXECUTE"))):
            on = (cur == key)
            # Selected: filled accent + white text. Unselected: card
            # surface + dark text, with a hover tint so it reads as
            # clickable. (Tk can't animate a colour transition — the
            # spec's 200ms fade would need per-frame after() stepping,
            # which looks choppy in Tk; an instant hover state is the
            # honest, cleaner option here.)
            b = tk.Button(track, text=lbl,
                          command=lambda k=key: self._set_panel3_view(k),
                          bg=acc if on else card,
                          fg=_ink(acc) if on else self.T("TEXT"),
                          font=F_SMALL_B, relief="flat", bd=0, cursor="hand2",
                          padx=SP3, pady=6,
                          activebackground=acc if on else pc["active_btn"],
                          activeforeground=_ink(acc) if on else acc)
            b.grid(row=0, column=col, sticky="ew", padx=1, pady=1)
            if not on:
                _hover(b, card, pc["active_btn"])
                self._press_depth(b)
        return row + 1

    def _set_panel3_view(self, v):
        if self._settings.get("panel3_view", "classic") == v:
            return
        self._settings["panel3_view"] = v
        save_data(self)
        self._apply_theme(self._mode)   # full rebuild in same theme
        # The tab NO LONGER resizes the window.
        #
        # It used to force "full" (all three panels) on PLAN and
        # "compact" (panel 3 only) on FOCUS, on the theory that the tab
        # and the layout were one mode switch. That held while PLAN
        # owned a task list — you needed the wide workspace to plan in.
        # It doesn't hold now: the tasks all live on FOCUS, PLAN is a
        # review screen, and having the window jump between two widths
        # every time you glance at the trend chart is disruptive rather
        # than helpful.
        #
        # Width is back to being the user's own choice, via the ◀ arrows
        # and Ctrl+F, and stays wherever they left it across a tab
        # switch. Note the project timers live on panel 2, so PLAN with
        # panels collapsed shows the segmented bar without the controls
        # that fill it — open panel 2 when you want to start a clock.

    def _build_scope_stats(self, parent, bg, row=0,
                           box_bg=None, box_bd=None,
                           cap_fg=None, val_fg=None):
        """Three side-by-side TODAY / MONTH / YEAR "time remaining" cards.

        Originally the top block of the FOCUS screen; now built into the
        PLAN screen's phase-bar column instead (see _build_left). Kept as
        its own method rather than inlined so the two callers can't drift
        apart, and so the widget list it produces keeps ONE canonical
        shape.

        Colours are parameters, not fixed lookups, because the two homes
        have different palettes: on PLAN these sit INSIDE the hero clock
        card, which paints itself from the _HERO table rather than from
        _PANEL_COLORS. Defaulting to the panel palette and hard-coding it
        would have left three panel-coloured boxes sitting on a
        differently-coloured card — very visible on the light themes,
        where the hero card is a pale tint and input_bg is white.

        Still populates self._fv_cd in TODAY / MONTH / YEAR index order —
        _update_scope_stats indexes it positionally, so that order is
        load-bearing, not incidental."""
        pc = _PANEL_COLORS[self._mode]
        _bbg = box_bg or pc["input_bg"]
        _bbd = box_bd or self.T("CARD_BORDER")
        _cfg = cap_fg or self.T("TEXT2")
        _vfg = val_fg or self.T("GREEN")
        stats = tk.Frame(parent, bg=bg)
        stats.grid(row=row, column=0, sticky="ew", padx=SP2, pady=(SP2, 4))
        self._fv_cd = []
        for i in range(3):
            stats.columnconfigure(i, weight=1, uniform="stat")
            box = tk.Frame(stats, bg=_bbg, highlightthickness=1,
                           highlightbackground=_bbd)
            box.grid(row=0, column=i, sticky="ew",
                     padx=(0 if i == 0 else 4, 0))
            cap = tk.Label(box, text="", bg=_bbg, fg=_cfg, font=F_STAT_CAP)
            cap.pack(pady=(5, 0))
            # Only card 0 (TODAY) carries the strong colour. It's the one
            # that's actually live — it counts down every second and you
            # can still act on it. "13 days" left in the month and "135
            # days" left in the year are reference facts you can't do
            # anything about right now; giving all three the same
            # emphasis meant the one you could act on didn't stand out
            # from the two you couldn't.
            val = tk.Label(box, text="", bg=_bbg,
                           fg=_vfg if i == 0 else _cfg, font=F_STAT_VAL)
            val.pack(pady=(0, 5))
            self._fv_cd.append((val, cap))
        # Populate immediately — _update_scope_stats only refreshes on a
        # SECOND change, so without this the cards would render blank for
        # up to a full second after every build/theme switch.
        self._fv_last_scope_s = -1
        self._update_scope_stats()

    def _build_today_progress(self, parent, grid_row, surf, bd, mut):
        """TODAY PROGRESS — the day's fuel gauge, one segment per project.

        Moved here from PLAN's hero card. The bar is fed by the PROJECT
        timers (press a project card's ▶), and it draws one slice per
        named project filling toward that project's own daily target, so
        six hours on one project can never read as a full day across six.
        The count underneath ("3/6 projects today") is the sentence the
        bar exists to produce.

        It belongs on FOCUS because it answers a question you ask while
        working, not while planning: PLAN now keeps only the 30/90-day
        trend, which is the opposite timescale.

        `surf` is the card colour it sits on, `bd` the empty-track
        colour, `mut` the secondary text colour."""
        blk = tk.Frame(parent, bg=surf)
        blk.grid(row=grid_row, column=0, sticky="ew", padx=SP3, pady=(2, SP2))
        blk.columnconfigure(0, weight=1)

        # Top row: name of the block on the left, the numbers on the right.
        # The LABEL is muted on purpose — it names the block, it is not
        # the data; on the accent it competed with the percentage beside
        # it, which is the actual headline.
        info_row = tk.Frame(blk, bg=surf)
        info_row.grid(row=0, column=0, sticky="ew")
        info_row.columnconfigure(1, weight=1)
        tk.Label(info_row, text="TODAY PROGRESS", bg=surf, fg=mut,
                 font=F_XS).grid(row=0, column=0, sticky="w")

        right_info = tk.Frame(info_row, bg=surf)
        right_info.grid(row=0, column=2, sticky="e")
        # "0h 57m / 8h" is the denominator behind the percentage next to
        # it — supporting detail, so it recedes and lets the % lead.
        self.prog_time_lbl = tk.Label(right_info, text="0h 0m / 5h",
                                      bg=surf, fg=mut, font=F_XS)
        self.prog_time_lbl.pack(side="left", padx=(0, 6))
        self.prog_pct_lbl = tk.Label(right_info, text="↻  0%", bg=surf,
                                     fg=self.T("GREEN"), font=F_SMALL_B)
        self.prog_pct_lbl.pack(side="left")
        self.streak_lbl = tk.Label(right_info, text="", bg=surf,
                                   fg=self.T("TEXT"), font=F_SMALL_B)
        self.streak_lbl.pack(side="left", padx=(8, 0))

        self.prog_outer = tk.Canvas(blk, bg=bd, height=22,
                                    highlightthickness=0)
        self.prog_outer.grid(row=1, column=0, sticky="ew", pady=(2, 0))
        self.prog_outer.bind("<Configure>",
                             lambda e: self._update_progress_bar())

        self.prog_lbl = tk.Label(blk, text="", bg=surf, fg=mut,
                                 font=F_XS, anchor="e")
        self.prog_lbl.grid(row=2, column=0, sticky="e", pady=(1, 0))
        self._update_progress_bar()

    def _build_focus_view(self, p, row):
        """FOCUS view — the EXECUTION CONTROL panel.

        Three blocks, in the order a working day actually asks for them:

            NOW          one task · one clock · one primary button
            STRIKE LIST  the (max 3) committed to today, with n/3
            NEXT         the pool you pick from — deliberately quiet

        What used to sit here was a Focus/Short/Long segmented control,
        a 25:00 hero countdown, four session dots and a 0h 0m / 5h goal
        bar. All of that made the panel about the TIMER. But a timer is
        never the question at the start of a work block — "what am I
        doing next" is, and the answer was buried below the fold in a
        flat list where every task looked equally urgent.

        The Pomodoro engine itself is untouched and still feeds
        focus_progress_secs; it simply no longer owns this screen. The
        progress bar likewise still lives on PLAN, where the segmented
        per-project version of it belongs.
        """
        cb = self.T("CARD_BG")
        t = self.T("TEXT")
        t2 = self.T("TEXT2")
        t3 = self.T("TEXT3")
        acc = self.T("GREEN")
        dg = self.T("DONE_GREEN")
        cborder = self.T("CARD_BORDER")
        pc = _PANEL_COLORS[self._mode]
        bn = self._settings.get("lang") == "bn"
        def L(en, b): return b if bn else en
        # _now_task/_strike_tasks read through _task_list(), which is
        # keyed off _active_task_list. _build_task_card sets it, but it
        # runs LAST here — without this line the NOW and STRIKE blocks
        # above would silently read PLAN's list on a cold start.
        self._active_task_list = "focus"
        # Stale handles from widgets this view no longer builds, popped
        # rather than left pointing at destroyed Tk objects: the
        # per-tick updaters guard with _alive()/hasattr, and a dangling
        # attribute turns those guards into TclError generators.
        # prog_* are NOT popped here any more — TODAY PROGRESS lives on
        # this screen now (see _build_today_progress). capacity_lbl still
        # belongs to PLAN's trend block and is still cleared.
        for _a in ("h_hand", "m_hand", "s_hand",          # analog clock
                   "_pomo_lbl", "_pomo_status", "_pomo_dots",
                   "_pomo_btn", "_fv_tab_btns", "_fv_task_btn",
                   "_fv_current_task",                     # pomodoro block
                   "capacity_lbl"):                        # PLAN trend card
            self.__dict__.pop(_a, None)

        import datetime as _dt
        now = _dt.datetime.now()

        # ── Card 1: compact date header ──────────────────────────────────────
        # Date information used to be the visual centre of this screen (a
        # 28px day number, a coloured day banner, three stacked countdown
        # rows). On a FOCUS screen the countdown is what matters, so this
        # is deliberately demoted to one quiet header line — the three
        # stat cards that briefly lived under it moved to PLAN entirely.
        sh = tk.Frame(p, bg=_SHADOW[self._mode])
        sh.grid(row=row, column=0, sticky="ew", padx=SP2)
        row += 1
        card = tk.Frame(sh, bg=cb, highlightthickness=1,
                        highlightbackground=cborder)
        card.pack(fill="both", expand=True, padx=(0, 2), pady=(0, 2))
        card.columnconfigure(0, weight=1)

        dayname = (BN_DAYS[now.weekday()] if bn else now.strftime("%A"))
        hdr = tk.Frame(card, bg=cb)
        hdr.grid(row=0, column=0, sticky="ew", padx=SP3, pady=(SP2, 2))
        hdr.columnconfigure(1, weight=1)
        tk.Label(hdr, text=f"{dayname}, {now.day} {now.strftime('%b %Y')}",
                 bg=cb, fg=t2, font=F_SMALL_B).grid(row=0, column=0, sticky="w")

        # TODAY PROGRESS rides in this same card rather than getting its
        # own: "what day is it" and "how much of it have you spent" are
        # one thought, and a second bordered card for two short rows
        # would cost ~14px of chrome to say so.
        self._build_today_progress(card, 1, cb, cborder, t2)
        # Wall clock is deliberately SECONDARY here — the Pomodoro
        # countdown is this screen's primary time display, and two bold
        # clocks competing made it ambiguous which one mattered.
        # No wall clock here.
        #
        # TODAY EXECUTION prints the live time INSIDE the hour you are
        # currently in, which is the same number doing more work — it
        # tells you where you are in the day as well as what time it is.
        # Printing it twice on one panel made both copies read as less
        # trustworthy, and this was the copy that said less.
        self.__dict__.pop("_fv_ampm", None)
        self.__dict__.pop("_fv_time_lbl", None)

        # The three TODAY / MONTH / YEAR stat cards used to sit here, on
        # row 1 of this card. They moved to the PLAN screen (into the
        # empty space under the day-phase bars) — see _build_scope_stats.
        # FOCUS is the screen you're on while actually working, so the
        # Pomodoro should own it outright; a month/year countdown is
        # planning context, and you already meet it on PLAN first.
        self._fv_cd = []

        # ══════════════════════════════════════════════════════════════════
        # NOW — the one task this panel is pointed at
        # ══════════════════════════════════════════════════════════════════
        # This card is the whole argument of the redesign: at any moment
        # there is exactly ONE thing you should be doing, and the panel
        # should say what it is before it says anything else. Everything
        # in the card answers one question — what (task name), where it
        # counts (project), how long so far (clock), and the single next
        # gesture (START / PAUSE). No mode picker, no second timer, no
        # competing call to action.
        _nsh = tk.Frame(p, bg=_SHADOW[self._mode])
        _nsh.grid(row=row, column=0, sticky="ew", padx=SP2, pady=(3, 0))
        row += 1
        ncard = tk.Frame(_nsh, bg=cb, highlightthickness=1,
                         highlightbackground=cborder)
        ncard.pack(fill="both", expand=True, padx=(0, 2), pady=(0, 2))
        ncard.columnconfigure(0, weight=1)
        self._now_card = ncard

        # A 3px accent rail down the left edge. The card carries no fill
        # tint of its own: on the light themes a tinted "hero" block
        # turned every other card grey by comparison, and on WAR ROOM it
        # glowed. A rail marks the card as the live one at any brightness.
        self._now_rail = tk.Frame(ncard, bg=cborder, width=3)
        self._now_rail.place(x=0, y=0, relheight=1.0)

        _nb = tk.Frame(ncard, bg=cb)
        _nb.grid(row=0, column=0, sticky="ew", padx=(SP3 + 3, SP3),
                 pady=(SP2, SP2))
        _nb.columnconfigure(0, weight=1)

        tk.Label(_nb, text=L("NOW", "এখন"), bg=cb, fg=t3,
                 font=F_STAT_CAP).grid(row=0, column=0, sticky="w")

        # 18px bold and allowed to wrap to two lines. The task's own
        # words are the most valuable text on the screen; truncating
        # them with an ellipsis to protect a fixed card height would be
        # protecting the layout from its own content.
        self._now_name = tk.Label(_nb, text="", bg=cb, fg=t,
                                  font=(_F, 18, "bold"), anchor="w",
                                  justify="left", wraplength=300)
        self._now_name.grid(row=1, column=0, sticky="ew", pady=(1, 0))

        # The project line only appears when task.project is set, and it
        # is only ever set by starring from a project card — never by
        # matching the task's wording. A guess here would mis-attribute
        # real recorded hours to the wrong project, which is worse than
        # showing nothing.
        self._now_proj = tk.Label(_nb, text="", bg=cb, fg=t2,
                                  font=F_XS, anchor="w")
        self._now_proj.grid(row=2, column=0, sticky="w", pady=(2, 0))
        self._now_proj.grid_remove()

        self._now_clock = tk.Label(_nb, text="00:00:00", bg=cb, fg=t,
                                   font=(_FM, -30, "bold"), anchor="w")
        self._now_clock.grid(row=3, column=0, sticky="w", pady=(4, 0))

        _nctrl = tk.Frame(_nb, bg=cb)
        _nctrl.grid(row=4, column=0, sticky="ew", pady=(6, 0))
        _nctrl.columnconfigure(0, weight=1)
        self._now_ctrl = _nctrl

        # ONE primary button, full width of its half. The old ▶ was a
        # 48px circle competing with a ↺ beside it and a task picker
        # under it; three controls for a screen with one decision.
        # Wrapped in a 1px frame so the same button can be FILLED when
        # idle and OUTLINED while running — see _render_now for why the
        # running state goes quiet rather than louder.
        self._now_run_wrap = tk.Frame(_nctrl, bg=acc)
        self._now_run_wrap.grid(row=0, column=0, sticky="ew")
        self._now_run_btn = tk.Button(self._now_run_wrap, text="▶  START",
                                      command=self._now_toggle_run,
                                      bg=acc, fg=_ink(acc), font=F_BODY_B,
                                      relief="flat", bd=0, cursor="hand2",
                                      pady=7,
                                      activebackground=self.T("GREEN2"),
                                      activeforeground=_ink(
                                          self.T("GREEN2")))
        self._now_run_btn.pack(fill="both", expand=True, padx=1, pady=1)
        self._press_depth(self._now_run_btn)

        # COMPLETE is secondary by weight but not by importance: it is
        # the action that advances the whole day. Outlined, not filled,
        # so it never competes with START for the same glance.
        #
        # The outline is a 1px parent FRAME, not highlightthickness on
        # the button. On Windows a flat, bd=0 tk.Button draws its
        # highlight ring only while it has keyboard focus, so the
        # bordered version was invisible until tabbed to — it read as
        # bare floating text next to a solid green block.
        _dwrap = tk.Frame(_nctrl, bg=cborder)
        _dwrap.grid(row=0, column=1, padx=(SP2, 0))
        self._now_done_btn = tk.Button(_dwrap, text="✓  COMPLETE",
                                       command=self._complete_now,
                                       bg=cb, fg=t2, font=F_SMALL_B,
                                       relief="flat", bd=0, cursor="hand2",
                                       padx=SP3, pady=6,
                                       activebackground=pc["active_btn"],
                                       activeforeground=dg)
        self._now_done_btn.pack(fill="both", expand=True, padx=1, pady=1)
        _hover(self._now_done_btn, cb, pc["active_btn"], t2, dg)

        # Explains the empty NOW card. It shares row 2 with the project
        # line because the two can never both apply — a card with no
        # task has no project — and putting it there means the sentence
        # sits directly under the words it explains instead of stranded
        # below two dead buttons, which is where it was first placed and
        # where it read as an unrelated footnote.
        self._now_empty = tk.Label(
            _nb, text=L("Pick from MIT, or + STRIKE a task",
                        "MIT থেকে বাছুন, বা + STRIKE দিন"),
            bg=cb, fg=t3, font=F_SMALL, anchor="w", justify="left",
            wraplength=300)
        self._now_empty.grid(row=2, column=0, sticky="w", pady=(3, 0))
        self._now_empty.grid_remove()

        # ══════════════════════════════════════════════════════════════════
        # STRIKE LIST — the ≤3 you committed to today
        # ══════════════════════════════════════════════════════════════════
        # THREE TABS under the pinned NOW card
        # ══════════════════════════════════════════════════════════════════
        #   HOURS            the hour-by-hour plan for today
        #   MIT              STRIKE (the hard ceiling of 3) + LIST
        #                    (today's other tasks) — one tab, two parts,
        #                    because choosing the three and seeing what
        #                    you are choosing FROM is one decision
        #   TASK LIST        tomorrow: anything that comes to mind
        #
        # NOW stays ABOVE the tabs, never inside one. It is the single
        # thing you are doing; hiding it behind a tab would mean the
        # answer to "what now" depends on which tab you last clicked.
        # Order is the order of the day, left to right: the hours you
        # have (EXECUTION), the few things that matter in them (MIT),
        # then everything else you wrote down (TASK LIST). EXECUTION
        # leads because it is the one you open the app inside — the
        # question at the start of a block is "what hour am I in", and
        # the answer used to be two clicks away behind MIT.
        # "HOURS", not "TODAY EXECUTION": the screen it lives on is now
        # called EXECUTE, and a word that repeats one level up does no
        # work distinguishing this tab from its two neighbours. HOURS
        # says exactly what the tab holds — the day cut into hours.
        _tabkeys = (("exec", L("HOURS", "ঘণ্টা")),
                    ("mit", L("MIT", "MIT")),
                    ("list", L("TASK LIST", "টাস্ক লিস্ট")))
        _cur_tab = self._settings.get("focus_tab", "exec")
        if _cur_tab not in [k for k, _ in _tabkeys]:
            _cur_tab = "exec"
        _tabrow = tk.Frame(p, bg=self.T("BG"))
        _tabrow.grid(row=row, column=0, sticky="ew", padx=SP2, pady=(6, 2))
        row += 1
        # ── Underline, not a second filled pill ──────────────────────────
        # PLAN | EXECUTE is level 1 and these three are level 2, but both
        # strips drew the selected item as a full accent block of the
        # same height and weight — so nothing on screen said which strip
        # contained the other. An underlined text tab is the standard
        # quieter rank below a filled segmented control: still obviously
        # a tab bar, visibly subordinate to the one above it, and it
        # gives one of the four competing accent fills back.
        for _i, (_k, _lbl) in enumerate(_tabkeys):
            _tabrow.columnconfigure(_i, weight=1, uniform="ftab")
            _on = (_k == _cur_tab)
            _cell = tk.Frame(_tabrow, bg=cb)
            _cell.grid(row=0, column=_i, sticky="ew",
                       padx=(0 if _i == 0 else 2, 0))
            _cell.columnconfigure(0, weight=1)
            _tb = tk.Button(_cell, text=_lbl,
                            command=lambda k=_k: self._set_focus_tab(k),
                            bg=cb, fg=acc if _on else t2,
                            font=F_SMALL_B if _on else F_XS,
                            relief="flat", bd=0, cursor="hand2",
                            pady=5, highlightthickness=0,
                            activebackground=pc["active_btn"],
                            activeforeground=acc)
            _tb.grid(row=0, column=0, sticky="ew")
            # 2px rule under the selected tab; a same-height transparent
            # one under the others so nothing shifts when you switch.
            tk.Frame(_cell, bg=acc if _on else cb, height=2).grid(
                row=1, column=0, sticky="ew")
            if not _on:
                _hover(_tb, cb, pc["active_btn"], t2, acc)

        if _cur_tab == "mit":
            # Three is a hard ceiling, not a suggestion. A limit you can
            # exceed is a preference; a limit you cannot is a decision,
            # and the decision is the point — this list is what makes the
            # day falsifiable at 6pm.
            #
            # No ★ glyphs in here. The row that is currently NOW is
            # already displayed, larger, in the card above; marking it
            # again would make one piece of state compete with itself in
            # two places. Membership IS the star.
            _ssh = tk.Frame(p, bg=_SHADOW[self._mode])
            _ssh.grid(row=row, column=0, sticky="ew", padx=SP2, pady=(1, 0))
            row += 1
            scard = tk.Frame(_ssh, bg=cb, highlightthickness=1,
                             highlightbackground=cborder)
            scard.pack(fill="both", expand=True, padx=(0, 2), pady=(0, 2))
            scard.columnconfigure(0, weight=1)

            _shdr = tk.Frame(scard, bg=cb)
            _shdr.grid(row=0, column=0, sticky="ew", padx=SP3, pady=(SP2, 2))
            _shdr.columnconfigure(0, weight=1)
            # "STRIKE" — the app's own verb for committing to a task,
            # and the same word on the + STRIKE button that fills this
            # card. The heading used to read MOST IMPORTANT TASKS, which
            # named the same thing in different words from the control
            # that feeds it.
            tk.Label(_shdr, text=L("STRIKE", "স্ট্রাইক"),
                     bg=cb, fg=t2, font=F_SMALL_B).grid(row=0, column=0,
                                                        sticky="w")
            self._strike_count_lbl = tk.Label(_shdr, text="0/3", bg=cb, fg=t2,
                                              font=F_SMALL_B)
            self._strike_count_lbl.grid(row=0, column=1, sticky="e")

            self.strike_inner = tk.Frame(scard, bg=cb)
            self.strike_inner.grid(row=1, column=0, sticky="ew",
                                   padx=SP2, pady=(0, SP2))
            self.strike_inner.columnconfigure(0, weight=1)
            # TODAY'S remaining tasks live under the three, on this same
            # tab. The three you committed to and the pool you promote
            # them FROM are one decision; splitting them across two tabs
            # meant picking today's work needed a tab switch each time.
            self._task_day = "today"
            self._build_task_card(p, row, list_key="focus")
            row += 1
        elif _cur_tab == "list":
            # TASK LIST is the "anything that comes to mind" backlog —
            # dated tomorrow, so it stays out of today's view until you
            # deliberately pull it in with "→ Today". Each tab now owns
            # exactly one day, which is why the old Today|Tomorrow switch
            # inside this card is gone: the tab already said which.
            self._task_day = "tomorrow"
            self._build_task_card(p, row, list_key="focus")
            row += 1
        else:
            self._build_exec_plan(p, row)
            row += 1

        self._render_now()
        # Second, belt-and-braces guard against the same blank-strip
        # class of bug: the first _render_tasks runs while Tk still has
        # not laid this panel out, so the list canvas measures itself
        # against geometry that is about to change. One re-render after
        # the event loop settles costs nothing and means the panel is
        # never one user interaction away from being correct.
        self.after(0, self._focus_settle)

    def _focus_settle(self):
        """Re-measure and re-render the NEXT list once, after Tk's first
        real layout pass. No-ops if the panel was replaced in between."""
        if self._alive("task_inner") is None or self._alive("task_canvas") is None:
            return
        try:
            self.update_idletasks()
            self.task_canvas.itemconfig(
                self._tw, width=self.task_canvas.winfo_width())
            self.task_canvas.configure(
                scrollregion=self.task_canvas.bbox("all"))
        except Exception as _e:
            log.debug("focus settle: %s", _e)
        self._render_tasks()

    def _build_legacy_pomodoro(self, p, row):
        """DEAD CODE — kept only so the widget recipe isn't lost.

        Never called — nothing references it since the panel became
        NOW + three tabs. The Pomodoro
        *engine* is still live and still drives focus_progress_secs; it
        is only this presentation of it that the Execution Control
        redesign replaced. Deleting the builder outright would make
        restoring it a from-scratch job rather than flipping one flag."""
        cb = self.T("CARD_BG")
        t = self.T("TEXT")
        t2 = self.T("TEXT2")
        acc = self.T("GREEN")
        cborder = self.T("CARD_BORDER")
        pc = _PANEL_COLORS[self._mode]
        bn = self._settings.get("lang") == "bn"
        def L(en, b): return b if bn else en
        # ── Card 2: real Pomodoro ────────────────────────────────────────────
        sh2 = tk.Frame(p, bg=_SHADOW[self._mode])
        sh2.grid(row=row, column=0, sticky="ew", padx=SP2, pady=(2, 0))
        row += 1
        pcard = tk.Frame(sh2, bg=cb, highlightthickness=1,
                         highlightbackground=cborder)
        pcard.pack(fill="both", expand=True, padx=(0, 2), pady=(0, 2))
        pcard.columnconfigure(0, weight=1)

        # Mode picker — a real segmented control (filled selected segment)
        # instead of three loose text buttons that didn't read as a group.
        tabs = tk.Frame(pcard, bg=cborder, highlightthickness=1,
                        highlightbackground=cborder)
        tabs.grid(row=0, column=0, pady=(SP2, SP1))
        self._fv_tab_btns = {}
        for i, (key, lbl) in enumerate((("focus", L("Focus", "ফোকাস")),
                                        ("short", L("Short", "শর্ট")),
                                        ("long", L("Long", "লং")))):
            b = tk.Button(tabs, text=lbl,
                          command=lambda k=key: self._pomo_set_mode(k),
                          bg=cb, fg=t2, font=F_SMALL_B, relief="flat",
                          bd=0, cursor="hand2", padx=SP4, pady=3,
                          activebackground=cb, activeforeground=acc)
            b.grid(row=0, column=i, padx=1, pady=1, sticky="ew")
            self._fv_tab_btns[key] = b

        # Hero countdown — the single most important thing on this screen.
        # Vertical padding through this whole block is deliberately tight:
        # the timer section was ~15-20% taller than it needed to be, and
        # every px reclaimed here goes to the task list below.
        self._pomo_lbl = tk.Label(pcard, text="25:00", bg=cb, fg=t,
                                  font=F_POMO_HERO)
        self._pomo_lbl.grid(row=1, column=0, pady=(0, 0))
        self._pomo_status = tk.Label(pcard, text="", bg=cb, fg=t2,
                                     font=F_POMO_CAP)
        self._pomo_status.grid(row=2, column=0)

        # Current task, right under the timer — so during a session the
        # user never has to look down at the list to remember what they
        # committed to. An empty Label still occupies a full line height,
        # so it is grid_remove()'d until a task is actually picked (see
        # _pomo_sync_ui) rather than left blank taking ~18px.
        self._fv_current_task = tk.Label(pcard, text="", bg=cb, fg=acc,
                                         font=F_BODY_B, wraplength=260,
                                         justify="center")
        self._fv_current_task.grid(row=3, column=0, pady=(2, 0))
        self._fv_current_task.grid_remove()

        # Session dots sit BELOW the timer block, not crowded against the
        # control buttons where they read as part of the controls.
        self._pomo_dots = tk.Label(pcard, text="○ ○ ○ ○", bg=cb, fg=acc,
                                   font=F_SMALL)
        self._pomo_dots.grid(row=4, column=0, pady=(6, 0))

        ctrl = tk.Frame(pcard, bg=cb)
        ctrl.grid(row=5, column=0, pady=(SP1, 0))
        # pill_bg/pill_fg, not input_bg: in WAR ROOM input_bg (#0F0F13) is
        # darker than the card it sits on, so the reset button vanished.
        # The 1px border keeps it readable on the light themes too.
        # Reset is deliberately smaller than Play — one is a correction,
        # the other is the action this whole screen exists for.
        rb = tk.Button(ctrl, text="↺", command=self._pomo_reset,
                       bg=pc["pill_bg"], fg=pc["pill_fg"], font=F_SMALL_B,
                       relief="flat", bd=0, cursor="hand2", width=3,
                       highlightthickness=1, highlightbackground=pc["border"],
                       activebackground=pc["active_btn"])
        rb.pack(side="left", padx=SP2)
        self._press_depth(rb)
        # 48x48 filled primary action. A tk.Button's width/height are in
        # TEXT units, so the only way to pin real pixels is to put it in a
        # fixed-size frame with propagation off and let it fill.
        _pw = tk.Frame(ctrl, width=48, height=48, bg=cb)
        _pw.pack(side="left", padx=SP2)
        _pw.pack_propagate(False)
        self._pomo_btn = tk.Button(_pw, text="▶", command=self._pomo_toggle,
                                   bg=acc, fg=_ink(acc), font=(_F, -20, "bold"),
                                   relief="flat", bd=0, cursor="hand2",
                                   activebackground=self.T("GREEN2"),
                                   activeforeground=_ink(self.T("GREEN2")))
        self._pomo_btn.pack(fill="both", expand=True)
        self._press_depth(self._pomo_btn)

        self._fv_task_btn = tk.Button(
            pcard, text="⏱  " + L("Which task are you on?",
                                  "কোন task এ কাজ করছেন?") + "  ▾",
            command=self._pomo_pick_task,
            bg=cb, fg=t2, font=F_SMALL, relief="flat", bd=0,
            cursor="hand2", activebackground=cb, activeforeground=acc)
        self._fv_task_btn.grid(row=6, column=0, pady=(0, 1))

        # ── Progress strip — ONE card, not four loose rows ────────────────────
        # These four elements (bar, sparkline, week stats, capacity hint)
        # were stacked directly on the panel background, so they read as
        # unrelated strays AND each carried its own margin. Grouping them
        # in a single bordered card with one shared padding box both ties
        # them together visually and reclaims ~40px for the task list.
        _gsh = tk.Frame(p, bg=_SHADOW[self._mode])
        _gsh.grid(row=row, column=0, sticky="ew", padx=SP2, pady=(2, 0))
        row += 1
        gbar = tk.Frame(_gsh, bg=pc["card2"], highlightthickness=1,
                        highlightbackground=cborder)
        gbar.pack(fill="both", expand=True, padx=(0, 2), pady=(0, 2))
        _gb = pc["card2"]
        gbar.columnconfigure(0, weight=1)
        inf = tk.Frame(gbar, bg=_gb)
        inf.grid(row=0, column=0, sticky="ew", padx=SP3, pady=(5, 0))
        inf.columnconfigure(0, weight=1)
        self.prog_time_lbl = tk.Label(inf, text="", bg=_gb, fg=t2, font=F_XS)
        self.prog_time_lbl.grid(row=0, column=0, sticky="w")
        self.streak_lbl = tk.Label(inf, text="", bg=_gb, fg=t, font=F_SMALL_B)
        self.streak_lbl.grid(row=0, column=1, sticky="e")
        # Percentage is the headline number of the progress bar — sized up
        # so it can be read at a glance instead of squinted at.
        self.prog_pct_lbl = tk.Label(inf, text="", bg=_gb, fg=acc,
                                     font=(_F, -15, "bold"))
        self.prog_pct_lbl.grid(row=0, column=2, sticky="e", padx=(6, 0))
        self.prog_outer = tk.Canvas(gbar, bg=pc["pb_empty"], height=20,
                                    highlightthickness=0)
        self.prog_outer.grid(row=1, column=0, sticky="ew", padx=SP3, pady=(2, 0))
        self.prog_outer.bind("<Configure>", lambda e: self._update_progress_bar())

        # NO trend chart here, deliberately. PLAN draws it, and this
        # screen could only draw it from the same daily_history — which
        # records PLAN's bucket (progress_secs), not FOCUS's independent
        # one. A chart on the FOCUS screen showing PLAN's hours would be
        # quietly wrong, which is worse than absent.
        #
        # The week-summary line that used to sit under here went with
        # the WEEK n/100 score it displayed (see the trend block comment
        # in _build_left). Popping the attributes — rather than leaving
        # destroyed widgets behind — is what lets the _alive() guards in
        # _draw_trend and _update_insights skip this view cleanly.
        self.__dict__.pop("spark_cv", None)
        self.__dict__.pop("trend_cv", None)
        self.__dict__.pop("trend_hint", None)
        self.__dict__.pop("week_lbl", None)
        self.__dict__.pop("stats_lbl", None)

        # Capacity-aware insight (same local-only computation as CLASSIC)
        self.capacity_lbl = tk.Label(gbar, text="", bg=_gb, fg=acc, font=F_XS,
                                     anchor="w")
        self.capacity_lbl.grid(row=2, column=0, sticky="ew", padx=SP3, pady=(0, 5))
        self.after(300, self._update_insights)

        # The task card is NOT built from here — _build_focus_view owns
        # it, so that restoring this block could never produce two live
        # task lists fighting over self.task_inner.
        self._pomo_sync_ui()

    # ══════════════════════════════════════════════════════════════════════
    # NOW / STRIKE LIST rendering
    # ══════════════════════════════════════════════════════════════════════
    def _set_focus_tab(self, k):
        if self._settings.get("focus_tab", "exec") == k:
            return
        self._settings["focus_tab"] = k
        save_data(self)
        self._apply_theme(self._mode)

    # ══════════════════════════════════════════════════════════════════════
    # TODAY EXECUTION — the day, one hour at a time
    # ══════════════════════════════════════════════════════════════════════
    # Names and colours only. The HOURS come from Settings, via
    # _phase_bounds — the same four numbers the PLAN screen's day-phase
    # bars already use.
    #
    # They were hard-coded here, which meant the app held two different
    # definitions of the same day: change "Work starts" to 10am in
    # Settings and PLAN would move while this list stayed at 9. Worse,
    # 11pm was "Evening" here and "Sleep" over there. One clock, one set
    # of boundaries — if you retime your day, everything retimes.
    # Morning · Work · Evening · Sleep — the order the PLAN screen's
    # phase bars already list them, which is also the order you live the
    # day. Not sorted by clock hour: that would float Sleep to the top
    # because it owns midnight.
    _EXEC_BLOCKS = (
        ("morning", "Morning", "DONE_GREEN"),
        ("work",    "Work",    "RED"),
        ("evening", "Evening", "YELLOW"),
        ("sleep",   "Sleep",   "GREEN"),
    )

    def _exec_block_hours(self):
        """[(key, name, colour, [hours...])] — every hour 0-23 assigned to
        exactly one block, whatever the Settings say.

        Each hour goes to the phase whose start it most recently passed,
        counting backwards around the clock. That is the definition of
        "which phase am I in", and computing it per hour is what makes it
        impossible to lose or duplicate one.

        BUG THIS FIXES: this built each block with range(start, end),
        which silently assumed morning < work < evening < sleep. The four
        Settings steppers are clamped 0-23 INDEPENDENTLY — nothing stops
        you setting Sleep to 00:00, or Morning after Work. Out of 4096
        settings combinations those steppers can reach, 3766 produced a
        broken day: hours appearing in two blocks at once (so one line of
        text showed up twice, and ticking either ticked both), or blocks
        of 42 hours. Only an already-sorted schedule worked."""
        b = self._phase_bounds()
        starts = {k: int(b[k][0]) % 24 for k, _n, _c in self._EXEC_BLOCKS}
        owner = {}
        for h in range(24):
            best, best_d = None, 99
            for k, _n, _c in self._EXEC_BLOCKS:
                d = (h - starts[k]) % 24
                if d < best_d:            # ties: first block listed wins
                    best_d, best = d, k
            owner[h] = best
        out = []
        for key, name, ckey in self._EXEC_BLOCKS:
            hs = [h for h in range(24) if owner[h] == key]
            # Read from the block's own start hour, so Sleep runs
            # 11pm, 12am, 1am rather than 12am … 11pm.
            hs.sort(key=lambda h, _s=starts[key]: (h - _s) % 24)
            out.append((key, name, ckey, hs))
        return out

    def _exec_key(self, day=None):
        return "__exec_%s" % (day or date.today())

    def _exec_day(self, day=None):
        d = self._habit_data.get(self._exec_key(day))
        return d if isinstance(d, dict) else {}

    def _exec_set(self, hour, text=None, done=None):
        d = dict(self._exec_day())
        row = dict(d.get(str(hour)) or {})
        if text is not None:
            row["t"] = text
        if done is not None:
            row["d"] = bool(done)
        d[str(hour)] = row
        self._habit_data[self._exec_key()] = d
        save_data(self)

    def _exec_counts(self, hours):
        """(done, planned) for one block — planned means a slot with text
        in it. An empty hour is not a task you failed to do."""
        d = self._exec_day()
        done = planned = 0
        for h in hours:
            row = d.get(str(h)) or {}
            if (row.get("t") or "").strip():
                planned += 1
                if row.get("d"):
                    done += 1
        return done, planned

    def _exec_current_block(self):
        h = time.localtime().tm_hour
        for key, _n, _c, hours in self._exec_block_hours():
            if h in hours:
                return key
        return "work"

    def _build_exec_plan(self, p, row):
        """The day as 24 hour-slots, grouped into four coloured blocks.

        Only the block you are IN is open. The other three collapse to a
        title and a count — but any of them can be clicked open, because
        planning tonight at 10am is the whole point of having the block,
        and a section that refuses to open is a section you stop trusting
        (the same argument that made every Product Journey heading
        expandable)."""
        cb = self.T("CARD_BG")
        t = self.T("TEXT")
        t2 = self.T("TEXT2")
        t3 = self.T("TEXT3")
        cborder = self.T("CARD_BORDER")
        night = self._mode in ("warroom", "journey", "midnight")
        bn = self._settings.get("lang") == "bn"
        _now_h = time.localtime().tm_hour
        _cur_block = self._exec_current_block()
        # In MEMORY, deliberately not saved.
        #
        # "Auto-collapse when its time zone isn't running" only stays
        # true if the automatic answer is what you get by default. Saved
        # to disk, one afternoon of opening Morning to plan tomorrow
        # would pin Morning open for the rest of the app's life and the
        # auto behaviour would never be seen again. A manual toggle is a
        # "let me look at that now", not a preference — it lasts the
        # session and the next launch is automatic again.
        _open = dict(getattr(self, "_exec_open", {}))

        _sh = tk.Frame(p, bg=_SHADOW[self._mode])
        _sh.grid(row=row, column=0, sticky="nsew", padx=SP2, pady=(1, 0))
        p.rowconfigure(row, weight=1)
        card = tk.Frame(_sh, bg=cb, highlightthickness=1,
                        highlightbackground=cborder)
        card.pack(fill="both", expand=True, padx=(0, 2), pady=(0, 2))
        card.columnconfigure(0, weight=1)
        card.rowconfigure(1, weight=1)

        _blocks = self._exec_block_hours()
        _tot_d = _tot_p = 0
        for _k, _n, _c, _hrs in _blocks:
            _d, _pl = self._exec_counts(_hrs)
            _tot_d += _d
            _tot_p += _pl

        hdr = tk.Frame(card, bg=cb)
        hdr.grid(row=0, column=0, sticky="ew", padx=SP3, pady=(SP2, 2))
        hdr.columnconfigure(1, weight=1)
        tk.Label(hdr, text=("TO-DO" if not bn else "আজকের কাজ"), bg=cb,
                 fg=t3, font=F_STAT_CAP).grid(row=0, column=0, sticky="w")
        tk.Label(hdr, text="(%d)" % _tot_p, bg=cb, fg=t3,
                 font=F_XS).grid(row=0, column=1, sticky="w", padx=(4, 0))
        tk.Label(hdr, text="%d/%d done" % (_tot_d, _tot_p), bg=cb,
                 fg=self.T("DONE_GREEN") if (_tot_p and _tot_d == _tot_p)
                 else t2, font=F_SMALL_B).grid(row=0, column=2, sticky="e")

        # The scroll host needs its OWN container.
        #
        # BUG THIS FIXES: _plan_scroll_host always grids itself at row 0
        # column 0 of whatever parent it is given. Handed `card` — whose
        # row 0 already held the TO-DO header — it landed on top of that
        # header, while the weight sat on row 1 where nothing was. The
        # result was a list clipped to a few hundred pixels with the
        # Evening block cut in half and empty white below it.
        _hostwrap = tk.Frame(card, bg=cb)
        _hostwrap.grid(row=1, column=0, sticky="nsew")
        _hostwrap.columnconfigure(0, weight=1)
        _hostwrap.rowconfigure(0, weight=1)
        host = self._plan_scroll_host(_hostwrap, cb)
        r = 0
        for bkey, bname, ckey, bhours in _blocks:
            col = self.T(ckey)
            tint = _blend(col, "#000000" if night else "#FFFFFF",
                          0.86 if night else 0.91)
            is_now = (bkey == _cur_block)
            shown = _open.get(bkey, is_now)
            bd, bp = self._exec_counts(bhours)

            blk = tk.Frame(host, bg=tint, highlightthickness=1,
                           highlightbackground=tint)
            blk.grid(row=r, column=0, sticky="ew", pady=(0, 4))
            blk.columnconfigure(0, weight=1)
            r += 1

            bh = tk.Frame(blk, bg=tint, cursor="hand2")
            bh.grid(row=0, column=0, sticky="ew", padx=SP2, pady=3)
            bh.columnconfigure(2, weight=1)
            # The block name was 10px — the SAME size as the task text
            # inside it, and both were the smallest type on the panel.
            # Nothing was leading the eye anywhere. Names and counts step
            # up; the captions around them stay small, so the block
            # header reads as a heading instead of another row.
            tk.Label(bh, text="▾" if shown else "▸", bg=tint, fg=col,
                     font=F_SMALL, cursor="hand2").grid(row=0, column=0)
            tk.Label(bh, text=bname, bg=tint, fg=col, font=(_F, 13, "bold"),
                     cursor="hand2").grid(row=0, column=1, padx=(5, 0))
            if is_now:
                tk.Label(bh, text=" NOW ", bg=col, fg=_ink(col),
                         font=(_F, 9, "bold"), padx=2).grid(
                    row=0, column=2, sticky="w", padx=(7, 0))
            tk.Label(bh, text="%d/%d" % (bd, bp), bg=tint, fg=col,
                     font=(_F, 12, "bold"), cursor="hand2").grid(
                row=0, column=3, sticky="e")

            def _toggle(e=None, _b=bkey, _def=is_now):
                o = dict(getattr(self, "_exec_open", {}))
                o[_b] = not o.get(_b, _def)
                self._exec_open = o
                self._apply_theme(self._mode)
            for _w in (bh,) + tuple(bh.winfo_children()):
                _w.bind("<Button-1>", _toggle)

            if not shown:
                continue

            rows = tk.Frame(blk, bg=tint)
            rows.grid(row=1, column=0, sticky="ew", padx=SP2, pady=(0, 4))
            rows.columnconfigure(2, weight=1)
            for i, h in enumerate(bhours):
                self._exec_row(rows, i, h, h == _now_h, tint, col,
                               t, t2, t3, cborder)

        self._exec_host = host

    def _exec_row(self, parent, i, hour, is_now, tint, col, t, t2, t3, cborder):
        """One hour. Tick · time · what you'll do · clear."""
        d = self._exec_day().get(str(hour)) or {}
        done = bool(d.get("d"))
        txt = d.get("t", "") or ""

        # An EMPTY hour recedes almost into the block behind it.
        #
        # Nineteen unplanned hours were each drawing a circle, a
        # timestamp and a rule — the same ink a planned one gets — so
        # roughly half the panel was spent showing you, at full strength,
        # that you had written nothing there. The two lines you HAD
        # written were lost in it. Weight should follow content: an empty
        # slot is a place you may type, not a thing to read.
        _filled = bool((txt or "").strip())
        _lit = _filled or is_now
        # Two ghosts, not one. The ○ on an empty hour is an INACTIVE
        # control — nothing to tick — and WCAG exempts those from the
        # text-contrast rule, so it may fade all the way back. The hour
        # LABEL is not inactive: it is the row's address, the thing that
        # tells you which slot you are about to type into. At the old
        # 0.6 blend it measured 1.69:1, i.e. two thirds of the panel had
        # unreadable timestamps. It recedes, but it stays legible.
        _ghost = _blend(t3, tint, 0.6)          # inert tick
        # No blend at all for the label. Even 20% toward the block tint
        # put the Evening rows at 3.28:1 — t3 is already the muted tier
        # and it passes on every block colour, and the row still reads as
        # empty because the line beside it is empty.
        _ghost_txt = t3

        def _tick(e=None):
            if not _filled:
                return          # nothing to tick off yet
            self._exec_set(hour, done=not done)
            self._apply_theme(self._mode)
        mark = tk.Label(parent, text="✓" if done else "○", bg=tint,
                        fg=(self.T("DONE_GREEN") if done
                            else (t3 if _lit else _ghost)),
                        font=F_SMALL, cursor="hand2" if _filled else "",
                        width=2)
        mark.grid(row=i, column=0, sticky="w", pady=2)
        mark.bind("<Button-1>", _tick)

        # The hour you are IN shows the live clock instead of its label.
        # A column of identical "09:00 AM / 10:00 AM" reads as a
        # timetable; one moving number in it is what tells you where you
        # actually are without counting rows.
        _hl = tk.Label(parent, text=self._exec_hour_text(hour, is_now),
                       bg=tint,
                       fg=(col if is_now else (t2 if _filled else _ghost_txt)),
                       font=(_FM, -13, "bold") if is_now else (_FM, -12))
        _hl.grid(row=i, column=1, sticky="w", padx=(0, 6))
        if is_now:
            self._exec_now_lbl = _hl

        # 13px, and 14px bold in the hour you are actually in.
        #
        # What you wrote was set at 10 — smaller than the block heading
        # above it and the same size as the chrome around it. On a page
        # whose entire job is to hold one line per hour, that line should
        # be the largest thing in its row, and the line for RIGHT NOW the
        # largest on the screen.
        var = tk.StringVar(value=txt)
        _ef = ((_F, 13, "overstrike") if done
               else ((_F, 14, "bold") if is_now else (_F, 13)))
        ent = tk.Entry(parent, textvariable=var, bg=tint,
                       fg=t3 if done else t, relief="flat", bd=0,
                       font=_ef, insertbackground=t, highlightthickness=0)
        ent.grid(row=i, column=2, sticky="ew", ipady=3)
        # The rule appears only where there is something to underline.
        # Twenty-four hairlines down an empty column read as a form to
        # fill in; two read as the day you actually planned.
        if _lit:
            tk.Frame(parent, bg=cborder, height=1).grid(row=i, column=2,
                                                        sticky="sew")

        def _save(e=None):
            self._exec_set(hour, text=var.get())
        ent.bind("<FocusOut>", _save)
        ent.bind("<Return>", _save)
        ent.bind("<KeyRelease>", lambda e: self._debounced_save(
            "exec_%d" % hour, 500, _save, ent))

        def _clear(e=None):
            self._exec_set(hour, text="", done=False)
            self._apply_theme(self._mode)
        # Hover-only was the old rule: fg == bg until the pointer entered
        # the row. That makes clearing an hour a control you can only find
        # by accident, and one a keyboard or touch user cannot find at
        # all. The real worry was 24 always-lit ✕ down an empty day — so
        # the rule is now "a row you have written in shows its clear
        # button", which is the only row where clearing means anything.
        _rest = t3 if txt else tint
        x = tk.Label(parent, text="✕", bg=tint, fg=_rest, font=F_XS,
                     cursor="hand2", width=2)
        x.grid(row=i, column=3, sticky="e")
        x.bind("<Button-1>", _clear)
        for _w in (mark, _hl, ent, x):
            _w.bind("<Enter>", lambda e, _x=x: _x.config(fg=t2), add="+")
            _w.bind("<Leave>", lambda e, _x=x, _r=_rest: _x.config(fg=_r),
                    add="+")

    @staticmethod
    def _exec_hour_text(hour, is_now):
        # 12-hour, with AM/PM, for BOTH — the live row was printing
        # "18:05:46" in a column of "07:00 PM", so the one row you look
        # at most was the one written in a different clock.
        if is_now:
            return time.strftime("%I:%M:%S %p")
        ampm = "AM" if hour < 12 else "PM"
        h12 = hour % 12 or 12
        return "%02d:00 %s" % (h12, ampm)

    def _update_exec_clock(self):
        """Tick the live hour once a second (called from _tick)."""
        lbl = self._alive("_exec_now_lbl")
        if lbl is None:
            return
        try:
            lbl.config(text=time.strftime("%I:%M:%S %p"))
        except Exception as e:
            log.debug("exec clock: %s", e)

    def _render_now(self):
        """Repaint both halves. Kept as one call because every action
        that changes a task can change either."""
        self._render_now_card()
        self._render_strike_list()

    def _render_now_card(self):
        """Repaint the NOW card only.

        Split from the strike list because the two now live in different
        places: NOW is pinned above the tabs, the strike list is inside
        the MIT tab. While it was one method guarding on BOTH widgets,
        switching to TASK LIST or TODAY EXECUTION destroyed strike_inner
        and the guard then stopped the NOW card updating too — the clock
        would freeze on any tab but the first."""
        ncard = self._alive("_now_card")
        if ncard is None:
            return
        cb = self.T("CARD_BG")
        t = self.T("TEXT")
        t2 = self.T("TEXT2")
        t3 = self.T("TEXT3")
        acc = self.T("GREEN")
        red = self.T("RED")
        cborder = self.T("CARD_BORDER")
        pc = _PANEL_COLORS[self._mode]
        bn = self._settings.get("lang") == "bn"
        def L(en, b): return b if bn else en

        task = self._now_task()
        running = bool(task) and task["id"] in self.task_timers

        # ── NOW ───────────────────────────────────────────────────────────
        if task is None:
            # COLLAPSE to one line.
            #
            # An empty NOW card was holding the most valuable strip on
            # the panel — the very top — with a dead 00:00:00, a disabled
            # START and a name reading "Nothing selected": about 180px,
            # roughly a fifth of the panel, to say that there is nothing
            # to say. Keeping the geometry still was the earlier
            # argument, and it was the wrong trade: a card that jumps
            # once when you commit a task is cheaper than one that
            # shouts "empty" all day.
            self._now_rail.config(bg=cborder)
            self._now_name.config(
                text=L("Nothing committed yet", "এখনো কিছু নেওয়া হয়নি"),
                fg=t3, font=(_F, 13))
            self._now_proj.grid_remove()
            self._now_clock.grid_remove()
            self._now_ctrl.grid_remove()
            self._now_empty.grid()
        else:
            self._now_empty.grid_remove()
            self._now_clock.grid()
            self._now_ctrl.grid()
            self._now_rail.config(bg=acc if running else cborder)
            self._now_name.config(text=_title_case(task["text"]), fg=t,
                                  font=(_F, 18, "bold"))
            pk = task.get("project")
            pname = ((self.vision_data.get(pk, {}) or {}).get("title")
                     or "").strip() if pk else ""
            if pname:
                self._now_proj.config(text="▸ " + _clip(pname.upper(), 34),
                                      fg=t2)
                self._now_proj.grid()
            else:
                self._now_proj.grid_remove()
            # Red digits while running, matching the running-task rows in
            # the list below — one colour means "this clock is moving"
            # everywhere in the app.
            self._now_clock.config(text=fmt_ms_parts(task.get("secs", 0))[0],
                                   fg=red if running else t)
            # The RUNNING state is the quiet one, which is the opposite
            # of the obvious choice and the point of the card.
            #
            # Filled amber for PAUSE put a large saturated block in the
            # user's peripheral vision for the entire length of a deep
            # work session, on the card they are supposed to be able to
            # ignore while working. It also gave one small card three
            # competing hues at once — green rail, red digits, amber
            # button. Outlined-accent says "running, press to stop"
            # just as clearly and then gets out of the way; the red
            # clock and the green rail already carry the live signal.
            self._now_run_wrap.config(bg=acc)
            self._now_run_btn.config(
                state="normal", cursor="hand2",
                text=("⏸  " + L("PAUSE", "বিরতি")) if running
                else ("▶  " + L("START", "শুরু")),
                bg=cb if running else acc,
                fg=acc if running else "#FFFFFF",
                activebackground=pc["active_btn"] if running
                else self.T("GREEN2"),
                activeforeground=acc if running else "#FFFFFF")
            self._now_done_btn.config(state="normal", cursor="hand2", fg=t2)


    def _render_strike_list(self):
        """Repaint the MIT tab's list. No-ops on the other two tabs."""
        if self._alive("strike_inner") is None:
            return
        cb = self.T("CARD_BG")
        t = self.T("TEXT")
        t2 = self.T("TEXT2")
        t3 = self.T("TEXT3")
        dg = self.T("DONE_GREEN")
        red = self.T("RED")
        pc = _PANEL_COLORS[self._mode]
        bn = self._settings.get("lang") == "bn"
        def L(en, b): return b if bn else en
        task = self._now_task()
        for w in self.strike_inner.winfo_children():
            w.destroy()
        strike = self._strike_tasks()
        done_n, total_n = self._strike_counts()
        # "1/3" was a lie whenever fewer than three were committed: with
        # two rows on screen and one finished it read as "one of three
        # done" and implied a third task that does not exist. The count
        # now reports progress against what you ACTUALLY took on, and
        # states any spare capacity separately instead of folding the
        # two different numbers into one fraction.
        _cl = self._strike_count_lbl
        _free = self.STRIKE_MAX - total_n
        _cl.config(text=f"{done_n}/{total_n}"
                   + (f"  ·  {_free} free" if _free > 0 else ""),
                   fg=dg if (total_n and done_n == total_n) else t2)

        if not strike:
            tk.Label(self.strike_inner,
                     text=L("Empty. Choose up to 3 — that is the day.",
                            "খালি। সর্বোচ্চ ৩টি বাছুন — ওটাই আজকের দিন।"),
                     bg=cb, fg=t3, font=F_SMALL, anchor="w",
                     justify="left", wraplength=290
                     ).grid(row=0, column=0, sticky="w", padx=SP2, pady=(2, 4))
            return

        _now_id = task["id"] if task else None
        for i, st in enumerate(strike):
            _sid = st["id"]
            _is_now = (_sid == _now_id)
            _sdone = bool(st.get("done"))
            # The current task gets a faint tinted row, the rest sit on
            # the plain card. Two tones, not three: "selected" and "not".
            _rbg = pc["active_btn"] if _is_now else cb
            r = tk.Frame(self.strike_inner, bg=_rbg, cursor="hand2")
            r.grid(row=i, column=0, sticky="ew", pady=1)
            r.columnconfigure(1, weight=1)

            # ── A committed task must outweigh an uncommitted one ────────
            # This row used to render at 13px NON-bold in the secondary
            # text colour, while the LIST pool underneath drew its rows
            # at 13px BOLD in the primary colour. So the three tasks you
            # had actually committed to read QUIETER than the pile you
            # had not — the hierarchy ran backwards through the one
            # decision this screen exists to make. A 3px accent rail and
            # the primary text weight put it the right way round.
            _rail = tk.Frame(r, bg=t3 if _sdone else self.T("GREEN"), width=3)
            _rail.place(x=0, y=0, relheight=1.0)

            _chk = tk.Button(r, text="✓" if _sdone else "□", bg=_rbg,
                             fg=dg if _sdone else t3, relief="flat",
                             font=F_BODY_B, bd=0, cursor="hand2", width=2,
                             highlightthickness=0, activebackground=_rbg,
                             command=lambda _t=st: self._toggle_done(_t))
            _chk.grid(row=0, column=0, padx=(SP2, 0), pady=4)

            _nm = tk.Label(r, text=_clip(_title_case(st["text"]), 40), bg=_rbg,
                           fg=t3 if _sdone else t,
                           font=(_F, -15, "bold"),
                           anchor="w")
            _nm.grid(row=0, column=1, sticky="ew", padx=(2, 4))

            _tm = tk.Label(r, text=fmt(st.get("secs", 0)), bg=_rbg,
                           fg=red if _sid in self.task_timers else t3,
                           font=(_FM, -11))
            _tm.grid(row=0, column=2, padx=(0, 2))

            # Removing from the list is un-starring, nothing more — the
            # task itself survives and reappears in NEXT below. Labelling
            # it ✕ next to a real delete button elsewhere would be
            # dangerous, so it is a minus.
            _rm = tk.Button(r, text="−", bg=_rbg, fg=t3, relief="flat",
                            font=F_BODY_B, bd=0, cursor="hand2", width=2,
                            highlightthickness=0,
                            activebackground=_rbg, activeforeground=red,
                            command=lambda x=_sid: self._toggle_strike(x))
            _rm.grid(row=0, column=3, padx=(0, 2))
            _hover(_rm, _rbg, _rbg, t3, red)

            # Clicking anywhere else on the row points NOW at it. A
            # finished task is not selectable — _now_task() would refuse
            # it anyway, and a click that visibly does nothing reads as
            # a broken button.
            if not _sdone:
                for _w in (r, _nm, _tm):
                    _w.bind("<Button-1>", lambda e, x=_sid: self._set_now(x))

    # ── Pomodoro engine ──────────────────────────────────────────────────────
    def _pomo_drive(self, on):
        """Route focus-session time into the selected task (or work timer)."""
        tid = self._pomo.get("task")
        if on and self._pomo["mode"] == "focus":
            if tid and any(t["id"] == tid and not t["done"] for t in self.tasks_focus):
                self.task_timers[tid] = True
            else:
                self.work_running = True
        else:
            if tid:
                self.task_timers.pop(tid, None)
            self.work_running = False

    def _pomo_set_mode(self, m):
        self._pomo_drive(False)
        self._pomo.update(mode=m, remain=self.POMO_DUR[m], running=False)
        self._pomo_sync_ui()

    def _pomo_toggle(self):
        self._pomo["running"] = not self._pomo["running"]
        self._pomo_drive(self._pomo["running"])
        self._pomo_sync_ui()

    def _pomo_reset(self):
        self._pomo_drive(False)
        self._pomo.update(remain=self.POMO_DUR[self._pomo["mode"]],
                          running=False)
        self._pomo_sync_ui()

    def _pomo_finish(self):
        """A period hit 00:00 — advance the cycle, wait for the user."""
        self._pomo_drive(False)
        try:
            self.bell()
        except Exception:
            pass
        if self._pomo["mode"] == "focus":
            self._pomo["n"] += 1
            nxt = "long" if self._pomo["n"] % 4 == 0 else "short"
        else:
            nxt = "focus"
        self._pomo.update(mode=nxt, remain=self.POMO_DUR[nxt], running=False)
        self._pomo_sync_ui()

    def _pomo_pick_task(self):
        pc = _PANEL_COLORS[self._mode]
        m = tk.Menu(self, tearoff=0, bg=pc["menu_bg"], fg=pc["menu_fg"],
                    activebackground=pc["menu_hover"],
                    activeforeground=pc["menu_fg"], font=F_SMALL)
        m.add_command(label="—", command=lambda: self._pomo_set_task(None))
        for t in [t for t in self.tasks_focus if not t["done"]][:12]:
            m.add_command(label=t["text"][:40],
                          command=lambda x=t["id"]: self._pomo_set_task(x))
        b = self._fv_task_btn
        m.tk_popup(b.winfo_rootx(), b.winfo_rooty() + b.winfo_height())

    def _pomo_set_task(self, tid):
        was = self._pomo["running"]
        if was:
            self._pomo_drive(False)
        self._pomo["task"] = tid
        if was:
            self._pomo_drive(True)
        self._pomo_sync_ui()

    def _pomo_sync_ui(self):
        """Refresh pomodoro widgets (safe if FOCUS view not built)."""
        try:
            if not (getattr(self, "_pomo_lbl", None)
                    and self._pomo_lbl.winfo_exists()):
                return
            po = self._pomo
            acc = self.T("GREEN")
            t2 = self.T("TEXT2")
            bn = self._settings.get("lang") == "bn"
            r = max(0, int(po["remain"]))
            self._pomo_lbl.config(text=f"{r // 60:02d}:{r % 60:02d}")
            _ST = {"focus": ("FOCUS SESSION", "ফোকাস সেশন"),
                   "short": ("SHORT BREAK", "শর্ট ব্রেক"),
                   "long": ("LONG BREAK", "লং ব্রেক")}
            # The line under the countdown says WHAT you are working on
            # when there is an answer — the task's own name, in Title
            # Case. "FOCUS SESSION" only restated the mode already shown
            # by the filled tab above it, so the most valuable line on
            # the screen was spent on the least new information.
            #
            # Breaks keep their own caption: during a break you are
            # deliberately NOT on the task, and naming it there would be
            # telling you to work through your rest.
            _tid_now = po.get("task")
            _task_now = next((t for t in self.tasks_focus
                              if t["id"] == _tid_now), None)
            if po["mode"] == "focus" and _task_now:
                self._pomo_status.config(
                    text=_title_case(_task_now["text"])[:46],
                    fg=self.T("TEXT"), font=F_H3)
            else:
                self._pomo_status.config(
                    text=_ST[po["mode"]][1 if bn else 0],
                    fg=t2, font=F_POMO_CAP)
            # Segmented control: the selected mode is FILLED, not just
            # recoloured text, so the group reads as one control.
            _cb = self.T("CARD_BG")
            for k, b in self._fv_tab_btns.items():
                _on = (k == po["mode"])
                b.config(bg=acc if _on else _cb,
                         fg=_ink(acc) if _on else t2,
                         activebackground=acc if _on else _cb,
                         activeforeground=_ink(acc) if _on else acc)
            self._pomo_btn.config(text="⏸" if po["running"] else "▶")
            k = po["n"] % 4
            self._pomo_dots.config(text="● " * k + "○ " * (4 - k), fg=acc)
            task = _task_now
            _ct = self._alive("_fv_current_task")
            if task:
                self._fv_task_btn.config(text="⏱  " + task["text"][:32] + "  ▾",
                                         fg=acc)
            # The 🎯 line is now only for BREAKS. In focus mode the status
            # line above already carries the task name, and printing it
            # twice, two lines apart, read as a bug. On a break it still
            # earns its place: the caption says "SHORT BREAK", so this is
            # the only reminder of what you are coming back to.
            if _ct is not None:
                if task and po["mode"] != "focus":
                    _ct.config(text="◎  " + task["text"][:44])
                    _ct.grid()          # re-show; keeps its original grid opts
                else:
                    _ct.config(text="")
                    _ct.grid_remove()   # reclaim the line height entirely
        except Exception as e:
            log.debug("pomo sync: %s", e)

    def _update_focus_view(self):
        """Per-second refresh of FOCUS view labels (called from _tick)."""
        # Each piece guards ITSELF. This used to bail out entirely if
        # _fv_time_lbl was missing — so removing the header clock (below)
        # would silently have frozen the NOW card's clock with it.
        try:
            import datetime as _dt
            now = _dt.datetime.now()
            if now.second == getattr(self, "_fv_last_s", -1):
                return
            self._fv_last_s = now.second
            w = self._alive("_fv_time_lbl")
            if w is not None:
                w.config(text=now.strftime("%I:%M:%S"))
                _ap = self._alive("_fv_ampm")
                if _ap is not None:
                    _ap.config(text=now.strftime("%p"))
            # NOW's clock, once a second — NOT every 50ms tick. Elapsed
            # work time has no meaningful hundredths digit, and redrawing
            # a 30px label 20x/second was measurable CPU for nothing.
            # Only the digits are touched here; colour, button state and
            # the strike rows all come from _render_now on real changes,
            # so this stays a two-line update.
            _nc = self._alive("_now_clock")
            if _nc is not None:
                _nt = self._now_task()
                if _nt is not None:
                    _running = _nt["id"] in self.task_timers
                    _nc.config(text=fmt_ms_parts(_nt.get("secs", 0))[0],
                               fg=self.T("RED") if _running else self.T("TEXT"))
            # live pomodoro digits (the FOCUS panel no longer builds the
            # Pomodoro card, so _pomo_lbl may legitimately be absent)
            _pl = self._alive("_pomo_lbl")
            if _pl is not None and self._pomo["running"]:
                r = max(0, int(self._pomo["remain"]))
                _pl.config(text=f"{r // 60:02d}:{r % 60:02d}")
        except Exception as e:
            log.debug("focus view: %s", e)

    def _update_scope_stats(self):
        """Per-second refresh of the TODAY / MONTH / YEAR cards.

        Split out of _update_focus_view when these cards moved to the
        PLAN screen: that method returns early unless the FOCUS view is
        built (it guards on _fv_time_lbl), so leaving this logic inside
        it would have left the cards frozen on their initial values on
        the PLAN screen, where they now actually live."""
        cd = getattr(self, "_fv_cd", None)
        if not cd:
            return
        try:
            if not cd[0][0].winfo_exists():
                self._fv_cd = []
                return
            import datetime as _dt
            now = _dt.datetime.now()
            if now.second == getattr(self, "_fv_last_scope_s", -1):
                return
            self._fv_last_scope_s = now.second
            bn = self._settings.get("lang") == "bn"
            # 1) time left in the work day.
            #
            # Reads the WORK PHASE's end (phase_evening_start) — the same
            # number the phase bars draw — not the old separate
            # "work_end" setting. Two settings described one real-world
            # thing and were free to disagree: the bars said "9:00 AM –
            # 6:00 PM, 39% done" while this card, reading work_end, said
            # 0h 0m left. Whichever the user believed, the other was
            # lying. One source of truth now; _phase_bounds owns it.
            end_h = self._phase_bounds()["work"][1]
            base = now.replace(hour=0, minute=0, second=0, microsecond=0)
            end = base + _dt.timedelta(hours=end_h)
            left = max(0, int((end - now).total_seconds()))
            # Captions are the SCOPE (TODAY / AUGUST / 2026) and the value
            # is the remaining amount — scanned top-to-bottom in one beat,
            # instead of the old "value + 'left in Aug'" phrasing that
            # repeated the same word three times down the column.
            # Past the end of the work window this card used to read
            # "00h 00m", which looks like a broken readout rather than a
            # finished work day — and it sits beside "2 days" and "124
            # days", so a zero reads as an error, not as a state. Name
            # the state instead. Only a true zero switches the copy; at
            # 00h 05m the window is genuinely still open.
            if left <= 0:
                # Smaller font for the text form: F_STAT_VAL is sized for
                # "26 days", and a sentence in 17px bold would run past
                # the edge of a third-of-a-panel card.
                cd[0][0].config(text="দিন শেষ" if bn else "work day over",
                                font=F_XS)
            else:
                cd[0][0].config(
                    text=f"{left // 3600:02d}h {left % 3600 // 60:02d}m",
                    font=F_STAT_VAL)
            cd[0][1].config(text="আজ" if bn else "TODAY")
            # 2) days left in month
            y, mo = now.year, now.month
            nxt = _dt.date(y + (mo == 12), mo % 12 + 1, 1)
            dim = (nxt - _dt.timedelta(days=1)).day
            _dl = f"{dim - now.day} days"
            cd[1][0].config(text=_dl, font=_stat_font(_dl))
            cd[1][1].config(text=now.strftime("%B").upper())
            # 3) days left in year
            dy = (_dt.date(y, 12, 31) - now.date()).days
            _dy = f"{dy} days"
            cd[2][0].config(text=_dy, font=_stat_font(_dy))
            cd[2][1].config(text=str(y))
        except Exception as e:
            log.debug("scope stats: %s", e)

    # =========================================================================
    def _project_cfgs(self):
        """Return list of project config dicts for the right panel."""
        # (key, label, night_hdr, night_sub, night_bdr, night_txt, night_acc,
        #              day_hdr,   day_sub,   day_bdr,   day_txt,   day_acc)
        PROJECTS = [
            # proj1 — blue  (#0550AE)
            ("proj1", "PROJECT 1", "#1C2128", "#161B22", "#58A6FF", "#E6EDF3", "#58A6FF",
             "#FFFFFF", "#F6F8FA", "#D0D7DE", "#24292F", "#0550AE"),
            # proj2 — orange (#BC4C00)
            ("proj2", "PROJECT 2", "#1C2128", "#161B22", "#F0883E", "#E6EDF3", "#F0883E",
             "#FFFFFF", "#F6F8FA", "#D0D7DE", "#24292F", "#BC4C00"),
            # proj3 — green (#1A7F37)
            ("proj3", "PROJECT 3", "#1C2128", "#161B22", "#3FB950", "#E6EDF3", "#3FB950",
             "#FFFFFF", "#F6F8FA", "#D0D7DE", "#24292F", "#1A7F37"),
            # proj4 — blue-teal (#0969DA)
            ("proj4", "PROJECT 4", "#1C2128", "#161B22", "#39D3F2", "#E6EDF3", "#39D3F2",
             "#FFFFFF", "#F6F8FA", "#D0D7DE", "#24292F", "#0969DA"),
            # proj5 — teal (#0E7490)
            ("proj5", "PROJECT 5", "#1C2128", "#161B22", "#20B8AA", "#E6EDF3", "#20B8AA",
             "#FFFFFF", "#F6F8FA", "#D0D7DE", "#24292F", "#0E7490"),
            # proj6 — purple (#6639BA)
            ("proj6", "PROJECT 6", "#1C2128", "#161B22", "#A371F7", "#E6EDF3", "#A371F7",
             "#FFFFFF", "#F6F8FA", "#D0D7DE", "#24292F", "#6639BA"),
        ]
        result = []
        for p in PROJECTS:
            k, lbl, hbn, sbn, bn, tn, an, hbd, sbd, bd, td, ad = p
            # Night mode: ALL cards use same neutral surfaces — color only as accent/border
            result.append({
                "key": k,
                "label": lbl,
                "header_bg": _PANEL_COLORS[self._mode]["card2"],
                "sub_bg": _PANEL_COLORS[self._mode]["card2"],
                "border": _PANEL_COLORS[self._mode]["border"],
                "text": THEMES[self._mode]["TEXT"],
                "accent": an if self._mode in ("warroom", "journey") else ad,
            })
        return result

    # =========================================================================
    def _build_projects(self, p):
        """3rd column — 6 project panels, scrollable, each with editable title,
           notes/analysis box and subtask list. All data auto-saved."""
        # Cleared before the cards are rebuilt so the registry can never
        # hold widgets from a destroyed panel — _tick writes to these
        # every second, and a stale entry would throw once per second.
        self._proj_time_lbls = {}
        bg = self.T("BG")
        p.columnconfigure(0, weight=1)
        p.rowconfigure(0, weight=1)

        wrap = tk.Frame(p, bg=bg)
        wrap.grid(row=0, column=0, sticky="nsew")
        wrap.columnconfigure(0, weight=1)
        wrap.rowconfigure(0, weight=1)

        cv = tk.Canvas(wrap, bg=bg, highlightthickness=0)
        sb = tk.Scrollbar(wrap, orient="vertical", command=cv.yview)
        _style_sb(sb, bg, _blend(bg, self.T("TEXT3"), 0.5))
        cv.configure(yscrollcommand=sb.set)
        cv.grid(row=0, column=0, sticky="nsew")
        sb.grid(row=0, column=1, sticky="ns")

        container = tk.Frame(cv, bg=bg)
        container.columnconfigure(0, weight=1)
        cwin = cv.create_window((0, 0), window=container, anchor="nw")
        container.bind("<Configure>",
                       lambda e: cv.configure(scrollregion=cv.bbox("all")))
        cv.bind("<Configure>",
                lambda e: cv.itemconfig(cwin, width=e.width))

        # Reset per-rebuild so "solo" never holds a setter closing over a
        # frame from a previous (destroyed) build of this panel.
        self._proj_body_setters = {}
        for i, (num, cfg) in enumerate(self._project_order()):
            container.rowconfigure(i, weight=0)   # natural height, scroll to see all
            self._build_one_project(container, cfg, i, num)

    def _build_one_project(self, parent, cfg, row_idx, num=None):
        """Build a single project card with header, notes, and task list."""
        key = cfg["key"]
        vd = self.vision_data.get(key, {"title": "", "note": "", "tasks": []})
        if key not in self.vision_data:
            self.vision_data[key] = vd

        acc_col = cfg["accent"]
        card_bg = _PANEL_COLORS[self._mode]["card2"]
        input_fg = _PANEL_COLORS[self._mode]["input_fg"]
        input_bg = _PANEL_COLORS[self._mode]["input_bg"]
        sec_txt = _PANEL_COLORS[self._mode]["sec_text"]
        bdr_col = _PANEL_COLORS[self._mode]["border"]
        muted = _PANEL_COLORS[self._mode]["muted"]

        # ── Outer card with colored top bar ───────────────────────────────────
        # Wrapper adds spacing between cards
        wrapper = tk.Frame(parent, bg=self.T("BG"))
        wrapper.grid(row=row_idx, column=0, sticky="ew",
                     padx=SP2, pady=(6, 0))
        wrapper.columnconfigure(0, weight=1)

        # Card with highlight border in accent color
        sec = tk.Frame(wrapper, bg=card_bg,
                       highlightthickness=1,
                       highlightbackground=bdr_col)
        sec.grid(row=0, column=0, sticky="ew")
        sec.columnconfigure(0, weight=1)

        # ── Colored top strip (10px, up from 6) — a Canvas, not a flat
        # Frame, so it can double as a progress bar (filled = done/total)
        # instead of being pure decoration. It's the one element in this
        # header that carries real data — everything else (badge, title
        # colour, pill) is identity/decoration — but at 6px it sat flush
        # against the card's own top edge and read as part of the
        # border, not a bar worth reading. 10px is still a thin strip,
        # not a fat one, but enough to actually register as filled vs.
        # empty at a glance. Each project's accent color is still its
        # identity, but a fully-saturated strip and a "0 tasks, nothing
        # started" strip used to look 100% identical — now an untouched
        # project reads as visibly muted. Drawn in _draw_top_strip()
        # further down, once task_widgets exists.
        _STRIP_H = 10
        top_strip = tk.Canvas(sec, bg=acc_col, height=_STRIP_H,
                              highlightthickness=0)
        top_strip.grid(row=0, column=0, sticky="ew")

        # ── Header row: number badge + title + count + buttons ────────────────
        hdr = tk.Frame(sec, bg=card_bg)
        hdr.grid(row=1, column=0, sticky="ew", padx=SP3, pady=(10, 6))
        hdr.columnconfigure(1, weight=1)

        # Project number badge — also the collapse/expand control (see
        # body-wrapper below). Click = toggle this card; double-click =
        # "solo" this card and collapse every other one, so a user
        # working through projects one at a time can silence the rest
        # with one action instead of closing each manually.
        #
        # Colour: this used to be a SOLID acc_col fill — the same colour
        # as the top strip, the title text, and the count pill, all in
        # the same header. Four things saying "this project's colour is
        # X" at once meant none of them actually stood out as THE
        # identity signal. The badge's real job is the collapse/expand
        # control, not a second colour chip, so it's neutral now (card
        # background, thin border, muted number) — the top strip above
        # it is enough to carry the colour identity, and the number
        # still reads fine on hover, where it borrows the accent for a
        # click cue instead of wearing it permanently.
        # The project's OWN number, not its position in the list — see
        # _project_order. A card that has sunk to the bottom still says
        # "1", because the TODAY PROGRESS bar's first segment is still it.
        num = str(num if num is not None else row_idx + 1)
        badge = tk.Label(hdr, text=num,
                         bg=card_bg, fg=muted,
                         font=F_SMALL_B,
                         width=2, padx=SP1, pady=SP1, cursor="hand2",
                         highlightthickness=1, highlightbackground=bdr_col)
        badge.grid(row=0, column=0, padx=(0, 8))
        _add_tooltip(badge, "Click: collapse/expand  ·  Double-click: "
                     "solo this project", side="right")
        _hover(badge, card_bg, acc_col, muted, "#FFFFFF")

        # Editable title — blended toward the theme's TEXT colour rather
        # than the raw, fully-saturated accent. 6 projects means 6
        # different hues in this same column; at full strength they
        # competed with each other as much as with the rest of the UI —
        # a "rainbow list" effect where the eye has to process 6 loud
        # colours before it even reads a single title. Blending keeps
        # each project's colour identity (still visibly distinct from
        # its neighbours) without every title shouting at full volume.
        # The top strip above keeps the pure, full-strength acc_col —
        # that's now the one place carrying the strong colour signal.
        def _soften(hex_col, amount=0.45):
            base = THEMES[self._mode]["TEXT"]
            r1, g1, b1 = int(hex_col[1:3], 16), int(hex_col[3:5], 16), int(hex_col[5:7], 16)
            r2, g2, b2 = int(base[1:3], 16), int(base[3:5], 16), int(base[5:7], 16)
            r = int(r1 + (r2 - r1) * amount)
            g = int(g1 + (g2 - g1) * amount)
            b = int(b1 + (b2 - b1) * amount)
            return f"#{r:02X}{g:02X}{b:02X}"
        _title_col = _soften(acc_col)
        title_entry = tk.Entry(hdr, bg=card_bg, fg=_title_col,
                               insertbackground=_title_col,
                               relief="flat", font=F_H2, bd=0)
        saved_title = vd.get("title", "")
        if saved_title:
            title_entry.insert(0, saved_title)
        else:
            # Placeholder ("PROJECT 1" etc.) must render muted, not in the
            # full accent color — accent color is otherwise this app's
            # signal for "real, saved content" everywhere else (task
            # titles, goal titles). A fresh project's placeholder used to
            # be indistinguishable from an actually-named project, and
            # _title_focus_in only auto-clears text when fg==muted, so on
            # a NEVER-edited project clicking in wouldn't clear the
            # placeholder at all — the muted check silently failed
            # because the color here was acc_col, not muted.
            title_entry.insert(0, cfg["label"])
            title_entry.config(fg=muted)
        # Title now takes the FULL width of the header row on its own —
        # it used to share row 0 with the count-pill/actions toolbar,
        # which forced the Entry into whatever leftover space was left
        # after that fixed-width cluster, clipping longer titles. The
        # toolbar moves down to its own row (see `actions` below) instead
        # of sharing this one.
        title_entry.grid(row=0, column=1, columnspan=2, sticky="ew",
                         padx=(0, SP2))

        title_entry.config(cursor="xterm")

        # A long title now has less room than before — grouping the
        # action buttons into the `actions` toolbar frame (see below)
        # gave that cluster a fixed width, and a single-line Entry just
        # visually clips whatever doesn't fit, mid-word/mid-number, with
        # no ellipsis. A tooltip with the full saved title is a cheap
        # safety net for that case; it won't track live edits until the
        # next rebuild, but the common case — an existing long title you
        # aren't currently retyping — is covered.
        if saved_title:
            _add_tooltip(title_entry, saved_title)

        def _save_title(e=None, te=title_entry, k=key):
            self.vision_data[k]["title"] = te.get().strip()
            save_data(self)
        title_entry.bind("<FocusOut>", _save_title)
        title_entry.bind("<Return>", _save_title)
        title_entry.bind("<KeyRelease>", _save_title)

        def _title_focus_in(e):
            if title_entry.cget("fg") == muted:
                title_entry.delete(0, "end")
                title_entry.config(fg=input_fg)

        def _title_focus_out(e):
            val = title_entry.get().strip()
            if not val:
                title_entry.delete(0, "end")
                title_entry.insert(0, cfg["label"])
                title_entry.config(fg=muted)
                val = ""
            self.vision_data[key]["title"] = val
            save_data(self)
        title_entry.bind("<FocusIn>", _title_focus_in)
        title_entry.bind("<FocusOut>", _title_focus_out)

        # ── Collapsible body — divider, notes, tasks, progress bar, add
        # input. Header (badge/title/count/buttons) above stays visible
        # even when collapsed, so the card is still identifiable and its
        # done/total count still readable at a glance. Collapse state is
        # per-project and persisted in _habit_data (not vision_data —
        # vision_data's save_data()/clean_vision() only keeps a fixed key
        # whitelist per project, so a new key here would be silently
        # dropped on save; same reason Project Journey's state lives
        # there too).
        body = tk.Frame(sec, bg=card_bg)
        body.grid(row=2, column=0, sticky="ew")
        body.columnconfigure(0, weight=1)

        # Collapsed-state preview — a collapsed card used to show NOTHING
        # but the header (title + "0/2" pill), so scanning down 6
        # projects to find out what's actually pending meant opening
        # every one of them. Shares body's row/column and is shown via
        # the exact same grid()/grid_remove() toggle, just inverted —
        # only one of the two is ever visible at a time.
        _preview_lbl = tk.Label(sec, text="", bg=card_bg, fg=sec_txt,
                                font=F_XS, anchor="w", padx=SP3,
                                cursor="hand2",
                                wraplength=0, justify="left")
        _preview_lbl.grid(row=2, column=0, sticky="ew", pady=(0, 6))

        def _collapsed_preview_text():
            """One line that answers 'how is this project doing today'
            without opening it.

            It used to show only the next pending task. But the question
            you scan six collapsed cards for is which project has gone
            QUIET — and the next task's name cannot tell you that: a
            project untouched for a week shows the same line as one you
            worked on an hour ago. Today's minutes against its own target
            can, and it is the same number the segmented TODAY PROGRESS
            bar and the Consistency grid are built from, so the three
            can never disagree."""
            bits = []
            try:
                bits.append(self._proj_time_text(
                    self._proj_secs(key), self._proj_target_secs(key)))
            except Exception as _e:
                log.debug("collapsed time: %s", _e)
            tasks = vd.get("tasks", [])
            pending = [t for t in tasks if not t.get("done")]
            if tasks:
                bits.append("%d/%d" % (len(tasks) - len(pending), len(tasks)))
            head = "   ·   ".join(bits)
            if not tasks:
                return head
            if not pending:
                return (head + "   ·   ✓ all tasks done") if head \
                    else "✓ All tasks done"
            first = pending[0].get("text", "")
            extra = len(pending) - 1
            tail = "→ %s%s" % (first,
                               "  (+%d more)" % extra if extra > 0 else "")
            return (head + "   ·   " + tail) if head else tail

        _collapsed_key = f"__proj_collapsed_{key}"
        _collapsed = {"v": bool(self._habit_data.get(_collapsed_key, False))}

        def _set_collapsed(c, save=True):
            _collapsed["v"] = c
            if c:
                body.grid_remove()
                _txt = _collapsed_preview_text()
                if _txt:
                    _preview_lbl.config(text=_txt)
                    _preview_lbl.grid()
                else:
                    _preview_lbl.grid_remove()
            else:
                body.grid()
                _preview_lbl.grid_remove()
            if save:
                self._habit_data[_collapsed_key] = c
                save_data(self)

        self._proj_body_setters[key] = _set_collapsed
        _set_collapsed(_collapsed["v"], save=False)

        def _toggle_collapse(e=None):
            _set_collapsed(not _collapsed["v"])
        badge.bind("<Button-1>", _toggle_collapse)

        # ── The whole collapsed card opens it, not just the badge ─────────
        # A collapsed card is 581x82px and exactly ONE 30x29px corner of
        # it responded to a click — about 1.5% of what looks like a
        # button. Worse, the biggest target in it is the title Entry,
        # which DOES take the click and just puts a text cursor in it, so
        # clicking the project's name read as "the app ignored me".
        #
        # Only while collapsed. An open card is full of real controls
        # (notes, timer, task rows) and a stray click closing it would be
        # far worse than a click that does nothing; the badge still
        # toggles both ways.
        def _expand_if_collapsed(e=None):
            if _collapsed["v"]:
                _set_collapsed(False)
        for _w in (wrapper, sec, top_strip, hdr, _preview_lbl):
            _w.bind("<Button-1>", _expand_if_collapsed)

        def _solo(e=None):
            for k, setter in self._proj_body_setters.items():
                # One stale setter used to kill the rest of the loop:
                # solo is all-or-nothing by nature, so a half-finished
                # pass leaves the panel in a state the user did not ask
                # for and cannot name.
                try:
                    setter(k != key)
                except Exception as _e:
                    log.debug("solo %s: %s", k, _e)
        badge.bind("<Double-Button-1>", _solo)

        # ── Thin divider ──────────────────────────────────────────────────────
        tk.Frame(body, bg=bdr_col, height=1).grid(
            row=0, column=0, sticky="ew", padx=0)

        # ── Notes box ────────────────────────────────────────────────────────
        nf = tk.Frame(body, bg=card_bg)
        nf.grid(row=1, column=0, sticky="ew", padx=SP3, pady=(SP2, SP1))
        nf.columnconfigure(0, weight=1)

        # Editable heading — click to rename, stretches full width
        _qn_title_key = f"_qn_title_{key}"
        _qn_title_saved = self.vision_data.get(_qn_title_key, "QUICK NOTES")
        _qn_title_var = tk.StringVar(value=_qn_title_saved)
        qn_title_entry = tk.Entry(nf,
                                  textvariable=_qn_title_var,
                                  bg=card_bg, fg=acc_col,
                                  insertbackground=acc_col,
                                  relief="flat", font=F_XS, bd=0,
                                  highlightthickness=0, cursor="xterm")
        qn_title_entry.grid(row=0, column=0, sticky="ew", pady=(0, SP1))

        def _save_qn_title(e=None):
            self.vision_data[_qn_title_key] = _qn_title_var.get().strip() or "QUICK NOTES"
            save_data(self)
        qn_title_entry.bind("<FocusOut>", _save_qn_title)
        qn_title_entry.bind("<Return>", _save_qn_title)
        qn_title_entry.bind("<KeyRelease>", _save_qn_title)

        # Text box — 5 lines visible, scrollable (back down from 10). At
        # 10 lines, a note that's just one short line — like most of
        # them are — sat at the top of a mostly-empty white rectangle
        # tall enough to dwarf the rest of the card; that dead space,
        # not the text box itself, was what made it read as bolted-on
        # rather than part of the same card system. 5 still comfortably
        # beats the original 3 for reading a longer note without
        # opening/scrolling, without the empty-box problem on the
        # common case of a short one.
        #
        # Pure white so the writing area reads as a sheet of paper
        # against the card, rather than the barely-there beige/grey
        # INPUT_BG it used before. Only on the light themes: WAR ROOM's
        # card is #141417, and a white box there would glare and break
        # the theme, so it keeps its dark input surface.
        _qn_bg = input_bg if self._mode in ("warroom", "journey") else "#FFFFFF"
        sb = tk.Scrollbar(nf, orient="vertical", width=8)
        _style_sb(sb, _qn_bg, _blend(_qn_bg, self.T("TEXT3"), 0.5))
        note_box = tk.Text(nf,
                           bg=_qn_bg, fg=input_fg,
                           font=F_BODY_B,
                           height=5, relief="flat", bd=0,
                           insertbackground=input_fg,
                           wrap="word", padx=SP2, pady=SP2,
                           highlightthickness=1,
                           highlightbackground=bdr_col,
                           highlightcolor=acc_col,
                           yscrollcommand=sb.set)
        sb.config(command=note_box.yview)
        note_box.insert("1.0", vd.get("note", ""))
        note_box.grid(row=1, column=0, sticky="nsew")
        sb.grid(row=1, column=1, sticky="ns")
        nf.columnconfigure(1, weight=0)
        nf.rowconfigure(1, weight=1)

        def _note_changed(e=None):
            self.vision_data[key]["note"] = note_box.get("1.0", "end").strip()
            save_data(self)
        note_box.bind("<FocusOut>", _note_changed)
        note_box.bind("<KeyRelease>", _note_changed)

        # ── Action toolbar — count pill + add-task + analysis + journey.
        # Lives here, right under Quick Notes, instead of squeezed into
        # the header next to the title (that layout forced the title
        # Entry to share its row with a fixed-width button cluster and
        # clipped longer project names). The title now owns its header
        # row alone; this toolbar gets its own row below the notes box.
        # No fill, no border, and split into two halves by KIND.
        #
        # This strip used to hold six controls of three different kinds —
        # an action (▶), two readouts (time, task count), another action
        # (+ task) and two navigation glyphs — all at the same size,
        # weight and colour, boxed together. A border says "these belong
        # together"; they did not. The task count and + task have moved
        # down to the TASKS heading they belong to, so what is left is
        # the timer on the left and the two pages on the right.
        _actrow = tk.Frame(body, bg=card_bg)
        _actrow.grid(row=2, column=0, sticky="ew", padx=SP3, pady=(2, SP1))
        _actrow.columnconfigure(1, weight=1)
        # A thin fill line ABOVE the timer, showing how much of this
        # project's own daily target today has eaten. The elapsed number
        # beside it already says "15m / 1h", but a number has to be read;
        # a bar is seen. It is also the clearest "this one is running"
        # signal on a panel of six identical cards, because it is the
        # only thing on the card that moves.
        _timerbox = tk.Frame(_actrow, bg=card_bg)
        _timerbox.grid(row=0, column=0, sticky="w")
        _timerbox.columnconfigure(0, weight=1)
        _pline = tk.Canvas(_timerbox, height=3, bg=bdr_col,
                           highlightthickness=0, width=118)
        _pline.grid(row=0, column=0, sticky="ew", pady=(0, 3))
        actions = tk.Frame(_timerbox, bg=card_bg)
        actions.grid(row=1, column=0, sticky="w")
        _navrow = tk.Frame(_actrow, bg=card_bg)
        _navrow.grid(row=0, column=2, sticky="e")

        # ── Project timer — the thing TODAY PROGRESS is actually made of.
        # One project at a time (see _toggle_project_timer): "an hour on
        # each project" stops meaning anything if three clocks can run
        # at once. The elapsed label shows TODAY only, against this
        # project's own daily target, because the question this answers
        # is "have I touched it today", not "how long have I ever spent".
        _pt_running = getattr(self, "_proj_running", None) == key
        ptimer_btn = tk.Button(
            actions, text="⏸" if _pt_running else "▶",
            bg=acc_col if _pt_running else card_bg,
            fg=_ink(acc_col) if _pt_running else acc_col,
            highlightthickness=0,
            font=F_XS, relief="flat", bd=0, cursor="hand2",
            # was padx=SP2, pady=1 -> a 17x18px hit area on the control
            # that starts the timer the whole app is built around.
            padx=SP2, pady=4, width=2,
            activebackground=acc_col if _pt_running else card_bg,
            activeforeground=_ink(acc_col) if _pt_running else acc_col,
            command=lambda k=key: self._toggle_project_timer(k))
        ptimer_btn.pack(side="left", padx=(SP1, 1), pady=2)
        self._press_depth(ptimer_btn)
        _add_tooltip(ptimer_btn, "Start / stop working on this project")

        ptime_lbl = tk.Label(actions, text="", bg=card_bg,
                             fg=acc_col if _pt_running else sec_txt,
                             font=F_XS, padx=SP1, pady=1, cursor="hand2")
        ptime_lbl.pack(side="left", pady=2)
        # Reads "12m / 60m" — elapsed AND target, on the card, because a
        # target you set in a different panel is a target you forget you
        # set. Clicking cycles it (15/30/45/60/90/120), the same
        # click-to-cycle idiom used by task urgency and the Circle
        # cadence chip, so no dialog and no stepper is needed here. The
        # −/+ stepper in the Consistency tab still edits the very same
        # value; this is a second door, not a second setting.
        ptime_lbl.bind("<Button-1>", lambda e, k=key: self._cycle_project_target(k))
        _add_tooltip(ptime_lbl, "Time today / daily target — click to "
                                "change the target")
        # Registered so _tick can update the running project's readout
        # without rebuilding the whole panel every second.
        self._proj_time_lbls[key] = (ptime_lbl, ptimer_btn, acc_col, sec_txt,
                                     _pline)
        _pline.bind("<Configure>",
                    lambda e, k=key: self._refresh_project_time_label(k))
        self._refresh_project_time_label(key)

        # The task count and "+ task" used to live on this row. They are
        # built further down instead, on the TASKS heading — a count
        # belongs to the list it counts, and an add button to the list it
        # adds to, not to a toolbar a row above them.

        # ── Monochrome glyphs, not colour emoji ──────────────────────
        # ▤ (bar-chart rows) for Business Analysis and ❖ (milestone
        # diamond) for Product Journey. Both are plain text glyphs, so
        # unlike 📊 and 🦋 they inherit fg — they sit muted at rest and
        # turn accent on hover, exactly like every other control here.
        # Colour emoji could do neither: they stayed brown-and-butterfly
        # coloured in all six themes, which is what made the toolbar
        # read as a toy next to the rest of the card.
        # NAMED, not glyphs.
        #
        # These open the two pages the whole app is built around, and
        # they were hidden behind ▤ and ❖ — symbols nobody can decode,
        # on the one row where the user is deciding where to go. Worse,
        # the tooltip called the first one "Business Development Plan"
        # while its own window title said "Business Analysis": one page,
        # two names. Words cost a few pixels and remove a guess.
        # "Goals" points PANEL 2 at this project. Goals are per-project
        # now — Project 1's short/mid/long term are not Project 2's — and
        # this is the switch. It sits with Analysis and Journey because
        # all three are "open this project's other page", and it renders
        # in the accent while its project is the one being shown, so the
        # card itself answers "whose goals am I looking at".
        _showing = (self._goal_project == key)
        for _lbl, _cmd, _tip in (
                ("Goals", lambda k=key: self._select_goal_project(k),
                 "Show this project's short / mid / long term goals "
                 "in panel 2"),
                ("Analysis", lambda: self._open_detail_window(key, cfg),
                 "Business Analysis — idea, numbers, decision"),
                ("Journey", lambda: self._open_project_journey(key, cfg),
                 "Product Journey — the dated record of what you tried")):
            _act = (_lbl == "Goals" and _showing)
            _nb = tk.Button(_navrow, text=_lbl,
                            bg=acc_col if _act else card_bg,
                            fg=_ink(acc_col) if _act else sec_txt,
                            font=F_XS, relief="flat", bd=0, cursor="hand2",
                            padx=SP2, pady=4, highlightthickness=0,
                            activebackground=acc_col if _act else card_bg,
                            activeforeground=_ink(acc_col) if _act
                            else acc_col, command=_cmd)
            _nb.pack(side="left", padx=(SP2, 0))
            if not _act:
                _hover(_nb, card_bg,
                       _PANEL_COLORS[self._mode]["active_btn"],
                       sec_txt, acc_col)
            _add_tooltip(_nb, _tip)

        # ── Task list ─────────────────────────────────────────────────────────
        tk.Frame(body, bg=bdr_col, height=1).grid(
            row=3, column=0, sticky="ew", padx=0, pady=(6, 0))

        tf_outer = tk.Frame(body, bg=card_bg)
        tf_outer.grid(row=4, column=0, sticky="ew", padx=SP3, pady=(6, 4))
        tf_outer.columnconfigure(0, weight=1)

        # "TASKS" heading — the notes box above has its own editable
        # "QUICK NOTES" caption, but this list just started cold with no
        # label at all, so the card visually jumped from notes straight
        # into task rows. Row 0 here used to belong solely to empty_lbl
        # (row 0 when there are 0 tasks, otherwise unused since the
        # first real task row starts at row 1) — this heading takes row
        # 0 permanently instead, and empty_lbl/task rows both shift down
        # by one to make room, so the heading is always present whether
        # the list is empty or not.
        _thdr = tk.Frame(tf_outer, bg=card_bg)
        _thdr.grid(row=0, column=0, sticky="ew", pady=(0, 2))
        _thdr.columnconfigure(1, weight=1)
        tk.Label(_thdr, text="TASKS", bg=card_bg, fg=sec_txt,
                 font=F_XS).grid(row=0, column=0, sticky="w")
        # The count and the add button now live HERE — see the note where
        # they are created. Both were sitting up in the toolbar, one row
        # of unrelated controls away from the list they describe.
        count_lbl = tk.Label(_thdr, text="", bg=card_bg, fg=sec_txt,
                             font=F_XS)
        count_lbl.grid(row=0, column=2, sticky="e", padx=(0, SP2))
        add_btn = tk.Button(_thdr, text="+ task", bg=card_bg, fg=acc_col,
                            font=F_XS, relief="flat", bd=0, cursor="hand2",
                            padx=SP2, pady=4, highlightthickness=0,
                            activebackground=card_bg, activeforeground=acc_col)
        add_btn.grid(row=0, column=3, sticky="e")
        _hover(add_btn, card_bg, _PANEL_COLORS[self._mode]["active_btn"],
               acc_col, acc_col)
        self._press_depth(add_btn)

        # Empty state — icon + title + hint, matching the pattern used by
        # panel 3 and the goals panel (_empty_state). This one was still
        # a single italic line, the last place in the app that hadn't
        # been brought up to that pattern.
        empty_lbl = tk.Frame(tf_outer, bg=card_bg)
        tk.Label(empty_lbl, text="◇", bg=card_bg, fg=muted,
                 font=(_F, 15)).pack(pady=(SP2, 0))
        tk.Label(empty_lbl, text="No tasks yet", bg=card_bg, fg=muted,
                 font=F_XS).pack()
        tk.Label(empty_lbl, text="Click  + task  to add your first one",
                 bg=card_bg, fg=muted, font=F_XS).pack(pady=(0, SP2))

        task_widgets = []

        # ── Progress bar ──────────────────────────────────────────────────────
        pb_bg = _PANEL_COLORS[self._mode]["pb_empty"]
        pb = tk.Canvas(body, bg=pb_bg, height=4, highlightthickness=0)
        pb.grid(row=5, column=0, sticky="ew")

        def _draw_prog(e=None):
            w = pb.winfo_width()
            if w < 2:
                return
            pb.delete("all")
            total = len(task_widgets)
            if total == 0:
                return
            done_c = sum(1 for tw in task_widgets if tw["done"].get())
            fill = int(w * done_c / total)
            pb.create_rectangle(0, 0, w, 4, fill=pb_bg, outline="")
            if fill > 0:
                pb.create_rectangle(0, 0, fill, 4, fill=acc_col, outline="")
        pb.bind("<Configure>", _draw_prog)

        def _draw_top_strip(e=None):
            w = top_strip.winfo_width()
            if w < 2:
                return
            top_strip.delete("all")
            total = len(task_widgets)
            if total == 0:
                # Nothing added yet — a muted strip instead of a fully
                # saturated one, so an empty project doesn't read the
                # same as an actively-progressing one.
                top_strip.create_rectangle(0, 0, w, _STRIP_H, fill=pb_bg,
                                           outline="")
                return
            done_c = sum(1 for tw in task_widgets if tw["done"].get())
            fill = int(w * done_c / total)
            top_strip.create_rectangle(0, 0, w, _STRIP_H, fill=pb_bg,
                                       outline="")
            if fill > 0:
                top_strip.create_rectangle(0, 0, fill, _STRIP_H, fill=acc_col,
                                           outline="")
            else:
                # Has tasks but none done — a thin sliver so "active,
                # zero progress" still looks distinct from "empty".
                top_strip.create_rectangle(0, 0, max(3, w // 20), _STRIP_H,
                                           fill=acc_col, outline="")
        top_strip.bind("<Configure>", _draw_top_strip)

        def _sync_to_memory():
            self.vision_data[key]["tasks"] = [
                {"text": tw["text"], "done": bool(tw["done"].get()),
                 "added_date": tw.get("added_date", str(date.today())),
                 # Stable identity, so a row can be pointed AT from the
                 # strike list without matching on its text. Text is the
                 # one field the user can rewrite at any time, and the
                 # whole point of the project link is that it survives
                 # a rename.
                 "pid": tw.get("pid")}
                for tw in task_widgets
            ]
            total = len(task_widgets)
            done_c = sum(1 for tw in task_widgets if tw["done"].get())
            # Always show it — was grid_remove()'d entirely at 0 tasks,
            # which was the right call back when the pill was a
            # saturated acc_col block (an empty "ghost" rectangle in
            # full colour looked broken). Now that it's a neutral pill,
            # showing "0/0" instead of hiding costs nothing visually but
            # fixes something that mattered more: with some cards
            # showing the pill and others not, the action-button cluster
            # started at a different x position card to card, so the
            # column of icons down the whole left panel never lined up.
            # Also switched grid()/grid_remove() -> pack() to match the
            # `actions` toolbar frame this pill now lives in (see the
            # comment on `actions` above) — grid and pack can't both
            # manage children of the same parent, and count_lbl.grid()
            # here would have raised a TclError the first time a task
            # was added to an empty project.
            count_lbl.config(text=f"{done_c}/{total}")
            _draw_prog()
            _draw_top_strip()

        def _sync_and_save():
            _sync_to_memory()
            save_data(self)

        def _calc_day(added_date_str):
            """Return DAY N string from added_date to today."""
            try:
                added = date.fromisoformat(added_date_str)
                diff = (date.today() - added).days + 1
                return f"DAY {diff}"
            except Exception:
                return "DAY 1"

        def _add_task_row(text, done=False, save=True, added_date=None,
                          pid=None):
            if empty_lbl.winfo_ismapped():
                empty_lbl.grid_remove()
            if added_date is None:
                added_date = str(date.today())
            # Rows saved before this existed get an id the first time
            # they're rendered, and keep it from then on. Uses the
            # project key so two projects can never collide.
            if not pid:
                pid = "%s:%d:%d" % (key, int(time.time() * 1000),
                                    len(task_widgets))
            done_var = tk.BooleanVar(value=done)
            # +2, not +1: row 0 in tf_outer is now permanently the
            # "TASKS" heading (see above), so both the empty-state
            # placeholder and every real task row shift down by one.
            row_n = len(task_widgets)
            task_bg = _PANEL_COLORS[self._mode]["task_alt"]
            tf = tk.Frame(tf_outer, bg=task_bg, highlightthickness=0)
            tf.grid(row=row_n + 2, column=0, sticky="ew", pady=SP1)
            tf.columnconfigure(2, weight=1)

            # done indicator strip
            strip_col = acc_col if not done else bdr_col
            tk.Frame(tf, bg=strip_col, width=3).grid(
                row=0, column=0, sticky="ns")

            cb = tk.Checkbutton(tf, variable=done_var,
                                bg=task_bg, activebackground=task_bg,
                                selectcolor=card_bg, fg=acc_col,
                                cursor="hand2")
            cb.grid(row=0, column=1, padx=(6, 2), pady=SP1)

            item_lbl = tk.Label(tf, text=text, bg=task_bg,
                                fg=muted if done else input_fg,
                                font=(_F, 10, "bold", "overstrike") if done else F_BODY_B,
                                anchor="w")
            item_lbl.grid(row=0, column=2, sticky="ew", pady=SP1, padx=(0, 4))

            # Day counter — was hard-coded red, the same colour this app
            # uses for risk/threat/delete-hover elsewhere. "DAY 37" is a
            # neutral fact (how long this subtask has existed), not a
            # warning, and it doesn't get more alarming as the number
            # grows — sec_text reads as information instead of an alert
            # that never resolves.
            day_lbl = tk.Label(tf, text=_calc_day(added_date),
                               bg=task_bg, fg=sec_txt,
                               font=F_XS)
            day_lbl._is_day_lbl = True
            day_lbl._added_date = added_date
            day_lbl.grid(row=0, column=3, padx=(0, 4))

            # Send THIS task into a Deep Work session. The task text goes
            # with it, so the session opens already aimed at the thing you
            # clicked instead of asking you to retype it. Hidden once the
            # task is done — there is nothing left to go deep on.
            # ── + STRIKE ─────────────────────────────────────────────────
            # THE entry point for task.project. Clicking it here is how
            # the app learns which project a piece of work belongs to —
            # the association comes from where you pressed, so it cannot
            # be wrong the way a name-match can. From this moment the
            # task's clock also drives this project's clock, which is
            # what fills TODAY PROGRESS and the Consistency grid.
            _sk_wrap = tk.Frame(tf, bg=task_bg)
            # highlightthickness=0: without it Tk draws its own 1px focus
            # ring, so the "ON TODAY" state — which is meant to be plain
            # text — came out looking exactly like the outlined "+ STRIKE"
            # button beside it. A state and an action reading as the same
            # control is the thing this chip was redesigned to avoid.
            _sk_btn = tk.Button(_sk_wrap, text="+ STRIKE", bg=task_bg,
                                fg=acc_col, font=(_F, -12, "bold"),
                                relief="flat", bd=0, cursor="hand2",
                                padx=4, pady=0, highlightthickness=0,
                                activebackground=task_bg,
                                activeforeground=acc_col)
            _sk_btn.pack(fill="both", expand=True, padx=1, pady=1)

            def _sk_refresh(_p=pid, _w=_sk_wrap, _b=_sk_btn):
                """Three states: committable, already on today's list,
                or blocked because the day is full."""
                try:
                    if not _b.winfo_exists():
                        return
                except Exception:
                    return
                _cur = self._pt_committed(_p)
                _on = _cur is not None and _cur.get("strike") \
                    and not _cur.get("done")
                _full = len(self._strike_tasks()) >= self.STRIKE_MAX
                if _on:
                    # Committed is a STATE, not an offer — so it loses
                    # the outline and becomes a quiet caption. Left as a
                    # bordered chip it kept the visual weight of a
                    # button, and every committed row then carried a
                    # bright badge competing with the task's own name.
                    _w.config(bg=task_bg)
                    _b.config(text="ON TODAY", fg=acc_col, cursor="")
                elif _full:
                    _w.config(bg=bdr_col)
                    _b.config(text="+ STRIKE", fg=muted, cursor="")
                else:
                    _w.config(bg=acc_col)
                    _b.config(text="+ STRIKE", fg=acc_col, cursor="hand2")

            def _sk_click(_p=pid, _t=text, _f=_sk_refresh):
                if self._strike_project_task(key, _p, _t):
                    _f()
                else:
                    # Say why, at the control that refused. The strike
                    # counter that normally carries this message lives
                    # on the other side of the window.
                    _sk_btn.config(text="DAY FULL", fg=muted)
                    self.after(1100, _f)
            _sk_btn.config(command=_sk_click)
            if not done:
                _sk_wrap.grid(row=0, column=4, padx=(0, 4))
            _sk_refresh()

            dw_btn = tk.Button(tf, text="◉", bg=task_bg, fg=muted,
                               font=F_XS, relief="flat", bd=0,
                               cursor="hand2", activebackground=task_bg,
                               activeforeground=acc_col)
            dw_btn.config(command=lambda t=text: self._open_deep_work(task=t))
            if not done:
                dw_btn.grid(row=0, column=5, padx=(0, 2))
            _hover(dw_btn, task_bg, task_bg, muted, acc_col)
            _add_tooltip(dw_btn, "Start a Deep Work session on this task")

            del_btn = tk.Button(tf, text="×", bg=task_bg, fg=muted,
                                font=F_BODY, relief="flat", bd=0,
                                cursor="hand2", activebackground=task_bg,
                                activeforeground=_PANEL_COLORS[self._mode]["del_hover"])
            del_btn.grid(row=0, column=6, padx=(0, 8))

            tw = {"frame": tf, "text": text, "done": done_var,
                  "lbl": item_lbl, "day_lbl": day_lbl,
                  "added_date": added_date, "pid": pid}
            task_widgets.append(tw)

            def _on_toggle(tv=done_var, lb=item_lbl, db=dw_btn,
                           sk=_sk_wrap, skf=_sk_refresh):
                lb.config(fg=muted if tv.get() else input_fg,
                          font=(_F, 10, "bold", "overstrike") if tv.get() else F_BODY_B)
                strips = [c for c in tf.winfo_children()
                          if isinstance(c, tk.Frame) and c.cget("width") == 3
                          and c is not sk]
                for s in strips:
                    s.config(bg=bdr_col if tv.get() else acc_col)
                if tv.get():
                    db.grid_remove()
                    sk.grid_remove()
                else:
                    db.grid()
                    sk.grid()
                    skf()
                _sync_and_save()
            cb.config(command=_on_toggle)

            # Let a completion in the right panel tick this row. Stored
            # by pid rather than held by the caller, so the lookup keeps
            # working after the cards are rebuilt under a new theme.
            def _remote_set(v, tv=done_var, f=_on_toggle):
                if bool(tv.get()) == bool(v):
                    return
                tv.set(bool(v))
                f()
            self._proj_task_sync[pid] = _remote_set

            del_btn.config(command=lambda w=tw: _delete_task(w))
            _hover(del_btn, task_bg, task_bg, muted,
                   _PANEL_COLORS[self._mode]["del_hover"])
            self._press_depth(del_btn)

            if save:
                _sync_and_save()

        def _delete_task(tw):
            # Snapshot BEFORE destroying the widget — tw["done"] is a Tk
            # BooleanVar tied to a widget that's about to go away, so its
            # value has to be read while it's still alive.
            snap = (tw["text"], bool(tw["done"].get()), tw.get("added_date"),
                    tw.get("pid"))
            self._proj_task_sync.pop(tw.get("pid"), None)
            tw["frame"].destroy()
            task_widgets.remove(tw)
            if not task_widgets:
                empty_lbl.grid(row=1, column=0, sticky="ew", pady=SP1)
            _sync_and_save()
            # Restore appends to the end rather than the original index —
            # the rows are rebuilt positionally, and re-inserting mid-list
            # would mean re-gridding every row after it. Acceptable for an
            # undo of an accidental delete; the task itself comes back
            # with its text, done-state and original added_date intact.
            self._show_undo_toast(
                host=tf_outer,
                on_undo=lambda: _add_task_row(snap[0], snap[1], save=True,
                                              added_date=snap[2],
                                              pid=snap[3]))

        for st in vd.get("tasks", []):
            _add_task_row(st.get("text", ""), bool(st.get("done", False)),
                          save=False,
                          added_date=st.get("added_date", str(date.today())),
                          pid=st.get("pid"))
        if not task_widgets:
            empty_lbl.grid(row=1, column=0, sticky="ew", pady=SP1)
        _sync_to_memory()

        # ── Inline add input ──────────────────────────────────────────────────
        inp_frame = tk.Frame(body, bg=card_bg)
        inp_var = tk.StringVar()
        inp_entry = tk.Entry(inp_frame, textvariable=inp_var,
                             bg=input_bg, fg=input_fg,
                             insertbackground=input_fg,
                             relief="flat", bd=0,
                             highlightthickness=1,
                             highlightbackground=bdr_col,
                             highlightcolor=acc_col,
                             font=F_BODY)
        inp_entry.pack(side="left", fill="x", expand=True,
                       padx=(12, 4), pady=SP2)

        def _commit_inp(e=None):
            txt = inp_var.get().strip()
            if not txt:
                inp_frame.grid_remove()
                return
            inp_var.set("")
            inp_frame.grid_remove()
            _add_task_row(txt, done=False, save=True)

        inp_entry.bind("<Return>", _commit_inp)
        save_btn = tk.Button(inp_frame, text="Add", command=_commit_inp,
                             bg=acc_col, fg="#ffffff", font=F_XS,
                             relief="flat", bd=0, cursor="hand2",
                             padx=SP2, pady=SP1,
                             activebackground=acc_col,
                             activeforeground="#ffffff")
        save_btn.pack(side="right", padx=(0, 12), pady=SP2)
        self._press_depth(save_btn)

        def _show_inp(e=None):
            _set_collapsed(False)
            inp_frame.grid(row=5, column=0, sticky="ew")
            inp_entry.focus_set()
        add_btn.config(command=_show_inp)
        _hover(add_btn, card_bg, _PANEL_COLORS[self._mode]["active_btn"])

        # bottom padding
        tk.Frame(body, bg=card_bg, height=6).grid(row=6, column=0)

    def _bind_goal_lists(self):
        """Point self.yearly / .monthly / .weekly at the SELECTED project.

        These three attributes are read and mutated in a dozen places
        (_render_goals, _add_goal, _toggle_goal, the note editor, the
        weekly review). Rather than rewrite every one of them to take a
        project key, they are rebound to the live list objects stored
        under the current project — so `self.yearly.append(...)` still
        writes straight into the store, and only save/load know the
        goals are keyed by project at all.

        The one rule this buys and enforces: never REASSIGN
        self.yearly/.monthly/.weekly, or the alias silently detaches and
        edits start landing nowhere. Deletion mutates in place for
        exactly that reason (see _delete_goal)."""
        store = self._goals_by_project.setdefault(
            self._goal_project, {_t: [] for _t in GOAL_TYPES})
        for _t in GOAL_TYPES:
            store.setdefault(_t, [])
            setattr(self, _t, store[_t])

    def _goal_project_title(self):
        """Display name of the project panel 2 is currently showing."""
        cfg = next((c for c in self._project_cfgs()
                    if c["key"] == self._goal_project), None)
        if cfg is None:
            return ""
        return ((self.vision_data.get(self._goal_project, {}) or {})
                .get("title") or "").strip() or cfg["label"]

    def _select_goal_project(self, key):
        """Point panel 2 at `key`'s goals."""
        if key == self._goal_project:
            return
        self._goal_project = key
        self._bind_goal_lists()
        save_data(self)
        # Rebuild BOTH panels, not just panel 2: the project cards carry
        # the "showing" state, so leaving panel 1 alone would light up
        # the new card without putting the old one out.
        for _panel, _build in ((self._panel_goals, self._build_right),
                               (self._panel_projects, self._build_projects)):
            try:
                for _w in _panel.winfo_children():
                    _w.destroy()
                _build(_panel)
            except Exception as _e:
                log.warning("goal project switch: %s", _e)
        # The panel-2 collapse arrow is a child of the goals panel but is
        # built by _build_ui, not _build_right — so wiping the panel's
        # children took it with it and left self._arrow_p1 pointing at a
        # destroyed widget. That is what made the arrow vanish after
        # pressing Goals, and what then broke collapsing entirely.
        self._arrow_p1 = self._mk_layout_arrow(self._panel_goals,
                                               self._toggle_panel1)
        self._apply_panel_layout(self._panel_layout, resize=False)
        for _t in GOAL_TYPES:
            self._render_goals(_t)

    def _build_right(self, p):
        """Build middle panel — goal sections (yearly/monthly/weekly)."""
        night = self._mode in ("warroom", "journey")
        p.columnconfigure(0, weight=1)
        SECTIONS = self.T("SECTIONS")

        # Three horizons, 50 / 25 / 25 of the panel's height, top to
        # bottom: SHORT (what you are doing now) still leads, but MID and
        # LONG each get enough room for two goals instead of one-and-a-
        # scrollbar. uniform= is required — weight alone divides only the
        # LEFTOVER space after each section's natural height, so three
        # sections with similar content would come out near-equal
        # instead of 50/25/25.
        _SEC_W = (50, 25, 25)

        # ── Whose goals are these? ────────────────────────────────────────
        # Goals are per-project now, so this panel is no longer showing
        # "your goals" — it is showing ONE project's. Without a name on
        # it, the same three headings would silently mean six different
        # things depending on which card you last pressed Goals on, and
        # nothing on screen would say which. Panel 1's Goals button is
        # the switch; this line is the answer.
        _gp_bar = tk.Frame(p, bg=self.T("BG"))
        # Left inset clears the collapse arrow, which is place()d at x=1
        # of this same panel — at SP3 the project's accent rail sat
        # underneath it.
        _gp_bar.grid(row=0, column=0, sticky="ew",
                     padx=(SP5, SP3), pady=(4, 0))
        _gp_bar.columnconfigure(1, weight=1)
        _gp_cfg = next((c for c in self._project_cfgs()
                        if c["key"] == self._goal_project), None)
        _gp_acc = _gp_cfg["accent"] if _gp_cfg else self.T("GREEN")
        tk.Frame(_gp_bar, bg=_gp_acc, width=3, height=14).grid(
            row=0, column=0, sticky="ns", padx=(0, SP2))
        tk.Label(_gp_bar, text=self._goal_project_title().upper(),
                 bg=self.T("BG"), fg=self.T("TEXT2"),
                 font=F_SMALL_B, anchor="w").grid(row=0, column=1, sticky="w")
        tk.Label(_gp_bar, text="GOALS", bg=self.T("BG"),
                 fg=self.T("TEXT3"), font=F_XS).grid(row=0, column=2,
                                                     sticky="e")
        p.rowconfigure(0, weight=0)

        for i, (attr, label, accent, bg_light, icon) in enumerate(SECTIONS):
            p.rowconfigure(i + 1, weight=_SEC_W[i] if i < len(_SEC_W) else 1,
                           uniform="goalsec")

            card_bg = _PANEL_COLORS[self._mode]["card2"]

            _shadow_col = {
                "focus": "#C8D4CC",
                "warroom": "#0A1A30",
                "energy": "#F0C8A8",
                "corporate": "#E0D8CC",
                "journey": "#070908",
                "rize": "#DDE1E6"}
            shadow = tk.Frame(p, bg=_shadow_col[self._mode])
            shadow.grid(row=i + 1, column=0, sticky="nsew",
                        padx=SP3, pady=(4, 8))
            shadow.columnconfigure(0, weight=1)
            shadow.rowconfigure(0, weight=1)
            sec = tk.Frame(shadow, bg=card_bg, highlightthickness=0)
            sec.grid(row=0, column=0, sticky="nsew", padx=(0, 1), pady=(0, 2))
            sec.columnconfigure(1, weight=1)
            # The list (row 1) is what should absorb spare height, not
            # the header bar (row 0) above it.
            sec.rowconfigure(1, weight=1)

            # Left accent strip — ONLY color signal
            tk.Frame(sec, bg=accent, width=4).grid(
                row=0, column=0, rowspan=2, sticky="ns")

            # ── Scrollable list ──────────────────────────────────────────────
            lw = tk.Frame(sec, bg=card_bg)
            lw.grid(row=1, column=1, sticky="nsew",
                    padx=(14, 8), pady=(4, 0))
            lw.columnconfigure(0, weight=1)
            lw.rowconfigure(0, weight=1)

            cv = tk.Canvas(lw, bg=card_bg, highlightthickness=0)
            sb = tk.Scrollbar(lw, orient="vertical", command=cv.yview)
            _style_sb(sb, card_bg, _blend(card_bg, self.T("TEXT3"), 0.5))
            cv.configure(yscrollcommand=sb.set)
            cv.grid(row=0, column=0, sticky="nsew")
            sb.grid(row=0, column=1, sticky="ns")

            inner = tk.Frame(cv, bg=card_bg)
            inner.columnconfigure(0, weight=1)
            wid = cv.create_window((0, 0), window=inner, anchor="nw")
            inner.bind("<Configure>",
                       lambda e, c=cv: c.configure(scrollregion=c.bbox("all")))
            cv.bind("<Configure>",
                    lambda e, c=cv, w=wid: c.itemconfig(w, width=e.width))

            # ── Header bar — label + stats + minimal Add button. Sits
            # ABOVE the task list (not below it) so the section name
            # reads as a heading you see first, not a footer caption
            # you only notice after scrolling past every task. ────────
            bar_bg = _PANEL_COLORS[self._mode]["card2"]
            bar = tk.Frame(sec, bg=bar_bg, highlightthickness=0)
            bar.grid(row=0, column=1, sticky="ew")
            bar.columnconfigure(0, weight=1)

            # Section label — editable
            _sec_title_key = f"_sec_title_{attr}"
            _saved_sec_title = self.vision_data.get(_sec_title_key, label)
            _sec_title_var = tk.StringVar(value=f"{icon}  {_saved_sec_title}")
            _sec_entry = tk.Entry(bar,
                                  textvariable=_sec_title_var,
                                  bg=bar_bg,
                                  fg=accent if night else _PANEL_COLORS[self._mode]["sec_text"],
                                  insertbackground=accent if night else _PANEL_COLORS[self._mode]["sec_text"],  # noqa: E501 (aligned colour table — clearer on one line)
                                  relief="flat",
                                  bd=0,
                                  font=F_BODY_B,
                                  highlightthickness=0)
            _sec_entry.grid(row=0, column=0, sticky="ew", padx=SP3, pady=SP2)
            def _save_sec_title(e=None, _attr=attr, _var=_sec_title_var,
                                _icon=icon, _lbl=label):
                raw = _var.get().strip()
                # strip icon prefix if user deleted it
                for _pfx in [f"{_icon}  ", f"{_icon} ", _icon]:
                    if raw.startswith(_pfx):
                        raw = raw[len(_pfx):].strip()
                        break
                if not raw:
                    raw = _lbl
                self.vision_data[f"_sec_title_{_attr}"] = raw
                _var.set(f"{_icon}  {raw}")
                save_data(self)
            _sec_entry.bind("<FocusOut>", _save_sec_title)
            _sec_entry.bind("<Return>", _save_sec_title)

            # Stats — very muted
            stats_lbl = tk.Label(bar, text="0 / 0", bg=bar_bg,
                                 fg=_PANEL_COLORS[self._mode]["muted"],
                                 font=F_XS, padx=SP2)
            stats_lbl.grid(row=0, column=1, sticky="e")
            setattr(self, f"_{attr}_stats", stats_lbl)

            # Minimal "+ Add" — real Button (was a click-bound Label), so
            # it's focusable/keyboard-activatable and uses the same
            # _hover + _press_depth feedback as every other action.
            add_goal_btn = tk.Button(bar, text="+ Add", bg=bar_bg, fg=accent,
                                     font=F_XS, relief="flat", bd=0,
                                     cursor="hand2", padx=SP3, pady=SP2,
                                     activebackground=bar_bg,
                                     activeforeground=accent,
                                     command=lambda a=attr, ac=accent, bgl=card_bg:
                                         self._open_add_goal_dialog(a, ac, bgl))
            add_goal_btn.grid(row=0, column=2, sticky="e")
            _hover(add_goal_btn, bar_bg, _PANEL_COLORS[self._mode]["active_btn"])
            self._press_depth(add_goal_btn)

            setattr(self, f"_{attr}_inner", inner)
            setattr(self, f"_{attr}_accent", accent)
            setattr(self, f"_{attr}_bglt", card_bg)

        self._render_goals("yearly")
        self._render_goals("monthly")
        self._render_goals("weekly")

    # ── Theme cycle (4 premium themes) ───────────────────────────────────────
    def _toggle_mode(self):
        """Cycle to next theme and rebuild UI (Ctrl+T).

        ROOT CAUSE of "Ctrl+T closes the app": Ctrl+T is wired through
        TWO separate handlers on purpose — the named <Control-t>/
        <Control-T> bindings, plus a raw <KeyPress> catch-all fallback
        (added because some widget classes silently swallow the named
        binding). Tk's binding dispatch doesn't guarantee the fallback
        is skipped just because the named handler already returned
        "break" — both are registered on the same "all" bindtag with
        different patterns, so a single physical Ctrl+T press can fire
        _toggle_mode() TWICE back-to-back. The second call landed while
        the first _apply_theme() was still mid-rebuild (every widget
        just destroyed, new ones only half-built), which could throw on
        a now-invalid widget reference — in the packaged pythonw build
        (no console to show a traceback) that kind of unhandled error
        during startup/rebuild can take the whole window down, which is
        what read as "it just closes".

        Fix: a short debounce, same pattern already used for the task
        checkbox double-toggle fix — the second call within 300ms of
        the first is simply ignored instead of re-entering the rebuild."""
        now = time.time()
        if now - getattr(self, "_last_theme_toggle_at", 0) < 0.3:
            return
        self._last_theme_toggle_at = now
        idx = THEME_ORDER.index(self._mode)
        self._apply_theme(THEME_ORDER[(idx + 1) % len(THEME_ORDER)])

    def _list_open_subwindows(self):
        """(attr, win, kind, key) for every currently-open Product
        Journey / Business Analysis / Business Dev Plan / Habit Tracker
        window — the set of sub-windows _apply_theme knows how to
        close-and-reopen so a theme switch re-themes them instead of
        either leaving them stuck in the old colors or (the original
        bug) destroying them for good with no replacement."""
        out = []
        try:
            keys = [c["key"] for c in self._project_cfgs()]
        except Exception:
            keys = []
        for key in keys:
            for kind, attr in (("journey", f"_journey_win_{key}"),
                                ("detail", f"_detail_win_{key}")):
                win = getattr(self, attr, None)
                if win is not None:
                    try:
                        if win.winfo_exists():
                            out.append((attr, win, kind, key))
                    except Exception:
                        pass
        for kind, attr in (("self_dev", "_self_dev_win"),
                            ("habit", "_habit_win")):
            win = getattr(self, attr, None)
            if win is not None:
                try:
                    if win.winfo_exists():
                        out.append((attr, win, kind, None))
                except Exception:
                    pass
        return out

    def _reopen_subwindow(self, kind, key):
        """Counterpart to _list_open_subwindows — rebuilds one sub-window
        after self._mode has already been updated, so it opens in the
        NEW theme's colors rather than whatever it had before."""
        try:
            if kind in ("journey", "detail"):
                cfg = next((c for c in self._project_cfgs()
                            if c["key"] == key), None)
                if cfg is None:
                    return
                if kind == "journey":
                    self._open_project_journey(key, cfg)
                else:
                    self._open_detail_window(key, cfg)
            elif kind == "self_dev":
                self._open_self_dev_window()
            elif kind == "habit":
                self._open_habit_tracker()
        except Exception as _e:
            log.debug("reopen subwindow after theme switch: %s", _e)

    def _apply_theme(self, mode):
        """Switch to the given theme and rebuild the whole UI.

        BUG FIXED: "Ctrl+T inside Product Journey closes it and jumps to
        the main window". Ctrl+T is bound with bind_all, which registers
        on the shared "all" bindtag — that applies to EVERY window in
        the process, not just the main one, so pressing it while a
        Toplevel (Product Journey, Business Analysis, Habit Tracker,
        etc.) has focus still fires this method. Every open Toplevel is
        created with `tk.Toplevel(self)`, which makes it a child of the
        root in Tk's widget tree — so `self.winfo_children()` included
        them too, and the blanket destroy-everything loop used to close
        whatever sub-window happened to be open right along with the
        main UI it actually meant to rebuild.

        Fix, in two parts: any open sub-window is closed and REOPENED
        (not just left alone) so it actually picks up the new theme's
        colors too — the user asked for both windows to re-theme
        together, not for the sub-window to freeze on the old palette.
        The destroy-everything loop further down still skips Toplevel
        instances as a safety net, in case a sub-window type isn't in
        the reopen list above (e.g. a future addition) — those simply
        keep running in their old colors rather than getting closed."""
        if mode not in THEME_ORDER:
            return
        _to_reopen = []
        for attr, win, kind, key in self._list_open_subwindows():
            try:
                win.destroy()
            except Exception:
                pass
            setattr(self, attr, None)
            _to_reopen.append((kind, key))

        self._mode = mode
        self.update_idletasks()
        self._set_dark_titlebar(self, mode in ("warroom", "journey"))
        for widget in self.winfo_children():
            if isinstance(widget, tk.Toplevel):
                continue
            widget.destroy()
        self._build_ui()
        self._render_tasks()
        self._render_goals("yearly")
        self._render_goals("monthly")
        self._render_goals("weekly")
        self._bind_global_scroll()
        self._bind_keyboard_nav()

        for kind, key in _to_reopen:
            self._reopen_subwindow(kind, key)

    # ── Widget helpers ────────────────────────────────────────────────────────
    def _lcard(self, parent, row_idx, row=0):
        night = self._mode in ("warroom", "journey")
        if not night:
            shadow = tk.Frame(parent, bg="#D1D5DB")
            shadow.grid(row=row, column=0, sticky="nsew", padx=SP2, pady=(3, 6))
            shadow.columnconfigure(0, weight=1)
            f = tk.Frame(shadow, bg=self.T("CARD_BG"), highlightthickness=0)
            f.grid(row=0, column=0, sticky="nsew", padx=(0, 1), pady=(0, 2))
        else:
            f = tk.Frame(parent, bg=self.T("CARD_BG"), highlightthickness=0)
            f.grid(row=row, column=0, sticky="nsew", padx=SP2, pady=SP1)
        return f

    def _ibtn(self, parent, text, color, cmd):
        b = tk.Button(parent, text=text, command=cmd,
                      bg=color, fg="#ffffff", relief="flat",
                      font=F_MONO_SM, width=2,
                      cursor="hand2", bd=0,
                      activebackground=self.T("GREEN2"),
                      activeforeground="#ffffff")
        self._press_depth(b)
        return b

    def _debounced_save(self, key, delay_ms, do_save, flash_widget=None):
        """Coalesce rapid edits into one save_data() call after `delay_ms`
        of inactivity, then briefly flash `flash_widget` to confirm."""
        jobs = getattr(self, "_debounce_jobs", None)
        if jobs is None:
            jobs = self._debounce_jobs = {}
        old = jobs.pop(key, None)
        if old:
            try:
                self.after_cancel(old)
            except Exception:
                pass

        def _fire():
            jobs.pop(key, None)
            try:
                do_save()
                save_data(self)
                if flash_widget is not None:
                    self._flash_saved(flash_widget)
            except Exception as e:
                log.debug("debounced_save[%s]: %s", key, e)
        jobs[key] = self.after(delay_ms, _fire)

    def _flash_saved(self, widget):
        """Briefly tint a widget's border/bg to confirm an autosave."""
        try:
            if not widget.winfo_exists():
                return
            acc = self.T("DONE_GREEN")
            orig = widget.cget("highlightbackground")
            widget.config(highlightbackground=acc, highlightcolor=acc)
            widget.after(500, lambda: widget.winfo_exists() and
                         widget.config(highlightbackground=orig, highlightcolor=orig))
        except Exception as e:
            log.debug("flash_saved: %s", e)

    def _press_depth(self, btn):
        """Micro-animation: button visually depresses on click."""
        def _dn(e):
            try:
                btn.config(relief="sunken", bd=1)
            except Exception:
                pass

        def _up(e):
            try:
                btn.after(80, lambda: btn.config(relief="flat", bd=0))
            except Exception:
                pass
        btn.bind("<ButtonPress-1>", _dn, add="+")
        btn.bind("<ButtonRelease-1>", _up, add="+")

    # ── Progress bar ─────────────────────────────────────────────────────────
    def _update_progress_bar(self):
        """Animate the today-progress bar based on work_secs.

        VISUAL ONLY changed to a rainbow gradient (green→yellow→orange→red→
        green→blue) matching the reference design. The underlying logic is
        UNCHANGED: bar still represents 9am→midnight, still resets fresh
        every day, still only fills while a Pomodoro/task timer is running.
        """
        if not hasattr(self, 'prog_outer'):
            return
        try:
            w = self.prog_outer.winfo_width()
            h = 22
            if w < 2:
                return

            # The bar fills by WORK DONE, not by clock time. The wall-clock
            # position (time_pct / EVE_START) was only needed by the old
            # "where are you in the day" marker, which the day-phase bars
            # replaced — the whole computation was dead weight recomputed
            # on every redraw.
            # How much work done today (0→1 over the goal) — UNCHANGED
            # LOGIC, but which bucket/goal it reads now depends on
            # whether PLAN or FOCUS is the active tab: the two screens
            # share this one set of widgets (rebuilt on tab switch, see
            # _set_panel3_view -> _apply_theme), so this is the single
            # place that decides which of the two independent
            # accumulators is currently on screen.
            # ONE meaning, on one screen. This used to switch bucket and
            # goal depending on which panel-3 view was showing, because
            # PLAN and FOCUS shared these widgets. TODAY PROGRESS now
            # exists only on FOCUS, and it is the PROJECT bar — a gauge
            # that changed what it measured depending on which tab you
            # were looking at was the ambiguity worth removing.
            _secs = self.progress_secs
            _goal = self._goal_secs()
            work_pct = min(_secs / _goal, 1.0)

            filled_w = int(w * work_pct)

            _bg = {
                "focus": "#E8E5E0",
                "warroom": "#1A1A1E",
                "energy": "#EBEBEB",
                "corporate": "#E7E2DB",
                "journey": "#17211D",
                "rize": "#E5E7EB"}
            _cur = {
                "focus": "#1A1A1A",
                "warroom": "#FFFFFF",
                "energy": "#111111",
                "corporate": "#1C1917",
                "journey": "#FFFFFF",
                "rize": "#111827"}

            self.prog_outer.delete("all")

            # 1. Background track
            self.prog_outer.create_rectangle(0, 0, w, h,
                                             fill=_bg[self._mode], outline="", width=0)

            # ── PLAN: one SEGMENT per project, not one long fill ──────────
            # A single bar hides the exact thing this bar exists to show.
            # Six hours of work could be an hour on each of six projects
            # or six hours on one — the totals bar reads 100% either way,
            # while the honest answer ("you haven't touched four of them")
            # is invisible. Segments make it unmissable: each project gets
            # its own slice, filling toward its OWN daily target, in its
            # own card colour. Three filled and three empty is a sentence
            # you can act on this afternoon.
            _projs = self._named_projects()
            if _projs:
                _n = len(_projs)
                _gap = 2
                _seg_w = (w - _gap * (_n - 1)) / float(_n)
                for _i, (_cfg, _ttl) in enumerate(_projs):
                    _x0 = _i * (_seg_w + _gap)
                    _x1 = _x0 + _seg_w
                    _tg = self._proj_target_secs(_cfg["key"])
                    _sc = self._proj_secs(_cfg["key"])
                    _f = min(1.0, _sc / _tg) if _tg > 0 else 0.0
                    self.prog_outer.create_rectangle(
                        _x0, 1, _x1, h - 1, fill=_bg[self._mode], outline="")
                    if _f > 0:
                        self.prog_outer.create_rectangle(
                            _x0, 1, _x0 + (_x1 - _x0) * _f, h - 1,
                            fill=_cfg["accent"], outline="")
                    # An untouched project gets a dashed outline rather
                    # than just staying empty — empty and "no target set"
                    # would otherwise look identical.
                    if _sc <= 0:
                        self.prog_outer.create_rectangle(
                            _x0, 1, _x1, h - 1, outline=_cfg["accent"],
                            dash=(2, 2), width=1)
                    # ── Which project is this segment?
                    # Without a label the segments are anonymous: you can
                    # see that the third one is empty but not what the
                    # third one IS, which is the entire question the bar
                    # is meant to answer. The number matches the badge on
                    # the project card in panel 2, so the eye can jump
                    # straight from "4 is empty" to the right card.
                    _txt_col = ("#FFFFFF" if _f > 0.55
                                else _cfg["accent"])
                    self.prog_outer.create_text(
                        (_x0 + _x1) / 2, h / 2, text=str(_i + 1),
                        font=(_F, -12, "bold"), fill=_txt_col)
                    # The running project gets a solid ring so you can
                    # see at a glance which clock is live.
                    if getattr(self, "_proj_running", None) == _cfg["key"]:
                        self.prog_outer.create_rectangle(
                            _x0, 1, _x1, h - 1, outline=_cur[self._mode],
                            width=2)
                # "Touched" needs a floor. Counting anything above zero
                # seconds meant tapping ▶ and immediately ⏸ on four
                # projects reported "4/6 projects today" off eight
                # minutes of total work — a number that flatters you is
                # worse than no number, because you start trusting it.
                _touched = sum(1 for _c, _ in _projs
                               if self._proj_meaningful(_c["key"]))
                _pl = self._alive("prog_lbl")
                if _pl is not None:
                    _pl.config(text=f"{_touched}/{_n} projects today")
                self._update_progress_labels(work_pct, _goal)
                return

            # 2. Gradient fill, interpolated into thin bands so it reads
            #    as a smooth ramp, not a few chunky blocks. (A hard-coded
            #    rainbow used to sit here behind an undocumented
            #    "rainbow_bar" flag no UI ever set.)
            if filled_w > 0:
                _RAINBOW = _ramp_interp(_PB_RAMPS[self._mode],
                                        max(24, min(60, filled_w)))
                n = len(_RAINBOW)
                band_w = max(1, filled_w / n)
                for i, col in enumerate(_RAINBOW):
                    bx0 = int(i * band_w)
                    bx1 = int((i + 1) * band_w)
                    if bx0 >= filled_w:
                        break
                    bx1 = min(bx1, filled_w)
                    self.prog_outer.create_rectangle(
                        bx0, 1, bx1, h - 1, fill=col, outline="")

            # Milestone glow — ring pulses for 2s at every quarter mark
            _mile = int(work_pct * 4)          # 0..4
            if _mile > getattr(self, "_pb_milestone", 0):
                self._pb_glow_until = time.time() + 2.0
            self._pb_milestone = _mile
            if time.time() < getattr(self, "_pb_glow_until", 0):
                self.prog_outer.create_rectangle(
                    0, 0, w, h, outline=self.T("GREEN"), width=2)
            # 100% goal celebration ring stays on
            if work_pct >= 1.0:
                self.prog_outer.create_rectangle(
                    0, 0, w, h, outline=_cur[self._mode], width=2)

            self._update_progress_labels(work_pct, _goal, set_prog_lbl=True)
        except Exception as _e:
            log.debug("progress bar draw: %s", _e)

    @staticmethod
    def _fmt_goal(secs):
        """Human hours/minutes for a goal figure.

        The old '%g' formatting assumed a whole or half number of hours,
        which was true while the goal came from a Settings spinner. It
        is now the SUM of six per-project minute targets, so a perfectly
        ordinary set of targets (30+30+60+60+90+155) rendered as
        '7.08333h'. Six significant digits of false precision on a
        number the user chose in 15-minute steps."""
        m = int(round(secs / 60.0))
        h, mm = m // 60, m % 60
        if h and mm:
            return f"{h}h {mm:02d}m"
        return f"{h}h" if h else f"{mm}m"

    def _update_progress_labels(self, work_pct, goal, set_prog_lbl=False):
        """The time / percentage readouts beside TODAY PROGRESS.

        Split out of _update_progress_bar so the segmented draw path and
        the no-projects-named fallback share one copy. set_prog_lbl is
        False on the segmented path because that label already carries
        something better there — "3/6 projects today" beats "2h 14m
        left" when the question is which project got skipped."""
        _secs = self.progress_secs
        _gtxt = self._fmt_goal(goal)
        try:
            if work_pct >= 1.0:
                if set_prog_lbl:
                    _pl = self._alive("prog_lbl")
                    if _pl is not None:
                        _pl.config(text="✓ " + _gtxt.upper()
                                   + " DEEP WORK COMPLETE!")
                _pp = self._alive("prog_pct_lbl")
                if _pp is not None:
                    _pp.config(text="↻  100%", fg=self.T("GREEN"))
                _pt = self._alive("prog_time_lbl")
                if _pt is not None:
                    _pt.config(text=_gtxt + " / " + _gtxt)
            else:
                mins_done = int(_secs // 60)
                mins_left = int(max(0, goal - _secs) // 60)
                pct_int = int(work_pct * 100)
                if set_prog_lbl:
                    _pl = self._alive("prog_lbl")
                    if _pl is not None:
                        _pl.config(text=f"{mins_left // 60}h "
                                        f"{mins_left % 60}m left")
                _pp = self._alive("prog_pct_lbl")
                if _pp is not None:
                    _pp.config(
                        text=f"↻  {pct_int}%",
                        fg=self.T("GREEN") if pct_int >= 70 else
                        "#A15904" if pct_int >= 40 else self.T("RED"))
                _pt = self._alive("prog_time_lbl")
                if _pt is not None:
                    _pt.config(text=f"{mins_done // 60}h "
                                    f"{mins_done % 60}m / " + _gtxt)
        except Exception as _e:
            log.debug("progress labels: %s", _e)

    # ── Day-phase bars (Morning/Work/Evening/Sleep) ─────────────────────────
    def _phase_bounds(self):
        """Start/end hour (float, 0-24) for each of the 4 day phases,
        read from Settings (defaults match the old ring's boundaries).
        Sleep wraps past midnight, so its "end" is expressed as
        morning_start + 24 — every other phase computation treats the
        clock as a plain 0-24 line, only sleep needs wrap-aware math."""
        st = self._settings
        ms = float(st.get("phase_morning_start", 5))
        ws = float(st.get("phase_work_start", 9))
        es = float(st.get("phase_evening_start", 18))
        ss = float(st.get("phase_sleep_start", 23))
        # Each phase ends at the NEXT occurrence of the following start,
        # not at its raw number.
        #
        # BUG THIS FIXES: sleep's end was hard-coded to morning + 24. That
        # is right only while sleep starts in the evening. Set "Sleep
        # starts" to 00:00 — a perfectly ordinary thing to want — and
        # sleep became (0, 29): a twenty-nine hour phase, so the PLAN bar
        # showed a sliver of progress all day and never filled. The same
        # arithmetic now covers all four, so any ordering the Settings
        # steppers allow produces a real duration.
        def _nxt(after, h):
            return h if h >= after else h + 24
        return {
            "morning": (ms, _nxt(ms, ws)),
            "work": (ws, _nxt(ws, es)),
            "evening": (es, _nxt(es, ss)),
            "sleep": (ss, _nxt(ss, ms)),
        }

    def _phase_progress(self, key):
        """0.0-1.0: how far TODAY's occurrence of this phase has filled.
        0 before it starts, 1 once it's over, live fraction while it's
        the current phase. Honest by construction — it's just today's
        clock time measured against the configured boundaries, nothing
        guessed or fetched."""
        try:
            now = datetime.now()
            now_h = now.hour + now.minute / 60 + now.second / 3600
            bounds = self._phase_bounds()
            start_h, end_h = bounds[key]
            duration = end_h - start_h
            if duration <= 0:
                return 0.0
            if key == "sleep":
                morning_start = bounds["morning"][0]
                if now_h >= start_h:
                    elapsed = now_h - start_h              # pre-midnight part
                elif now_h < morning_start:
                    elapsed = (24 - start_h) + now_h        # post-midnight part
                else:
                    elapsed = 0.0                            # tonight hasn't started
                return max(0.0, min(1.0, elapsed / duration))
            if now_h < start_h:
                return 0.0
            if now_h >= end_h:
                return 1.0
            return (now_h - start_h) / duration
        except Exception as e:
            log.debug("phase progress: %s", e)
            return 0.0

    @staticmethod
    def _fmt_hour(h):
        """24h float -> '5:00 AM' / '11:30 PM' (12-hour clock, matching
        the digital time display right next to these bars)."""
        h = h % 24
        hh, mm = int(h), int(round((h - int(h)) * 60))
        if mm == 60:
            hh, mm = hh + 1, 0
        ap = "AM" if hh < 12 else "PM"
        return f"{hh % 12 or 12}:{mm:02d} {ap}"

    def _current_phase(self):
        """Which phase 'now' falls inside — used to emphasise one row."""
        for k in ("morning", "work", "evening", "sleep"):
            p = self._phase_progress(k)
            if 0.0 < p < 1.0:
                return k
        return None

    def _build_phase_bars(self, parent, bg):
        """4 labeled real-time bars — Morning / Work / Evening / Sleep.

        Each row follows the same information hierarchy used by data-dense
        productivity tools (Linear/Notion-style): a colour swatch and the
        phase name on the left, the configured time range and a % on the
        right, then the bar itself. The earlier version coloured the label
        text itself in the phase colour — that failed contrast on light
        themes (a pale 'Evening' purple on cream is close to unreadable),
        so the text is now the theme's normal text colour and the colour
        signal moved to a small swatch, which is the accessible pattern.

        `bg` must be the HOST CARD's background, not self.T("BG") — these
        bars sit inside the hero clock card (CARD_BG2), and painting them
        with the panel background instead leaves a visibly mismatched
        rectangle behind the labels."""
        t2 = self.T("TEXT2")
        t3 = self.T("TEXT3")
        sc = _SEG_COLORS[self._mode]
        bn = self._settings.get("lang") == "bn"
        labels = _SEG_LABELS_BN if bn else _SEG_LABELS_EN
        bounds = self._phase_bounds()

        parent.columnconfigure(0, weight=1)
        frame = tk.Frame(parent, bg=bg)
        frame.grid(row=0, column=0, sticky="new", padx=SP2, pady=(6, 4))
        frame.columnconfigure(1, weight=1)

        # sc index: 0=sleep, 1=morning, 2=work, 3=evening (see _SEG_COLORS)
        specs = [("morning", labels[1], sc[1]), ("work", labels[2], sc[2]),
                 ("evening", labels[3], sc[3]), ("sleep", labels[0], sc[0])]
        self._phase_bar_widgets = {}
        cur = self._current_phase()
        # Four FIXED columns — icon | name | time range | percentage.
        # sticky="e" plus a fixed-width % column means the ranges and the
        # percentages each line up in one vertical column across all four
        # rows, instead of drifting with each label's own text width.
        _ICON = 13                      # spec: 12-14px icon
        for i, (key, lbl, col) in enumerate(specs):
            r = i * 2
            _top = _PHASE_ROW_GAP if i else 0   # row pitch ~20px
            sw = tk.Canvas(frame, width=_ICON, height=_ICON, bg=bg,
                           highlightthickness=0)
            sw.grid(row=r, column=0, sticky="w", padx=(0, 6), pady=(_top, 2))
            sw.create_oval(1, 1, _ICON - 1, _ICON - 1, fill=col, outline="")
            # Labels are SemiBold (bold is the closest weight Tk exposes)
            # for every phase, per spec — the current phase is then
            # distinguished by full-strength text colour rather than by
            # weight alone, so the row hierarchy stays consistent.
            name = tk.Label(frame, text=lbl, bg=bg,
                            fg=self.T("TEXT") if key == cur else t2,
                            font=F_PHASE_NAME, anchor="w")
            name.grid(row=r, column=1, sticky="w", pady=(_top, 2))
            # Thin spaces around the dash rather than full ones. The range
            # is the widest thing in the row and it was 8px over budget —
            # and the whole overrun came off the phase NAME, which is the
            # one string in the row you cannot reconstruct from the rest.
            rng = tk.Label(frame, bg=bg, fg=t3, font=F_PHASE_META, anchor="e",
                           text=f"{self._fmt_hour(bounds[key][0])}\u2009–\u2009"
                                f"{self._fmt_hour(bounds[key][1])}")
            # padx was (8, 8). The four-column row demanded 276px inside a
            # 268px frame, and the shortfall came off column 1 (the only
            # weighted column) — i.e. off the phase NAME, the one string
            # in the row you cannot infer from the others.
            rng.grid(row=r, column=2, sticky="e", padx=(6, 2), pady=(_top, 2))
            pct = tk.Label(frame, bg=bg, fg=t3, font=F_PHASE_META,
                           anchor="e", width=4)
            pct.grid(row=r, column=3, sticky="e", pady=(_top, 2))
            # Bar: 13px tall (was 7) with fully rounded ends, per spec.
            cv = tk.Canvas(frame, height=_PHASE_BAR_H, bg=bg,
                           highlightthickness=0)
            cv.grid(row=r + 1, column=0, columnspan=4, sticky="ew")
            cv.bind("<Configure>", lambda e, k=key: self._draw_phase_bars(only=k))
            # Every widget in the row is kept so the whole row (not just
            # the label) can be tinted when that phase is the active one.
            self._phase_bar_widgets[key] = {
                "cv": cv, "col": col, "pct": pct, "name": name, "rng": rng,
                "row": (sw, name, rng, pct, cv)}
        self._draw_phase_bars()

    def _draw_phase_bars(self, only=None):
        """Redraw one bar (`only=key`, e.g. on resize) or all 4 (called
        once/minute from _update_clock, same cadence as the old ring)."""
        widgets = getattr(self, "_phase_bar_widgets", None)
        if not widgets:
            return
        pc = _PANEL_COLORS[self._mode]
        track = pc["pb_empty"]
        cur = self._current_phase()
        base_bg = getattr(self, "_clock_bg", self.T("CARD_BG"))
        # The row you're actually IN gets a tinted background across the
        # whole row, so "which block am I in right now?" is answered by a
        # glance rather than by comparing four percentages.
        live_bg = pc["active_btn"]
        keys = [only] if only else list(widgets.keys())
        for key in keys:
            entry = widgets.get(key)
            if not entry:
                continue
            cv, col, pct, name = entry["cv"], entry["col"], entry["pct"], entry["name"]
            rng = entry.get("rng")
            try:
                if not cv.winfo_exists():
                    continue
                w = cv.winfo_width()
                if w < 2:
                    continue
                frac = self._phase_progress(key)
                # Defined here, not further down, because the bar fill
                # below now needs it too (only the live phase is coloured).
                _live = (key == cur)
                row_bg = live_bg if _live else base_bg
                h = _PHASE_BAR_H
                rad = h / 2          # fully rounded ends (pill)
                cv.delete("all")
                cv.config(bg=row_bg)
                _round_rect(cv, 0, 0, w, h, rad, fill=track)
                fw = int(w * frac)
                # Heatmap intensity: the fill is a blend of the phase's
                # heat colour toward the card background, weighted by how
                # far through the phase we are. So a bar carries its value
                # twice — in length AND in colour strength — which is what
                # makes a row of them scan like a heatmap instead of four
                # unrelated progress bars.
                # ── One accent at a time ──────────────────────────────
                # All four bars used to fill in their own saturated
                # colour (blue / teal / red / amber). Four full-strength
                # colours stacked in one card meant nothing led: the eye
                # had no entry point, and the red "Work" bar shouted
                # loudest even at 3% while the bar you were actually in
                # might be the quiet teal one. Now only the CURRENT phase
                # keeps its colour; the others fill in a neutral grey.
                # The phase you're in is found instantly, and the card
                # goes from four competing signals to one.
                if fw >= rad:
                    _fill_col = (_heat(col, frac, row_bg) if _live
                                 else _heat(self.T("TEXT3"), 0.45, row_bg))
                    _round_rect(cv, 0, 0, fw, h, rad, fill=_fill_col)
                # The ACTIVE row sits on a tinted background, and TEXT3
                # (the faintest tone, fine on the plain card) washed out
                # against that tint — the time range and % on the row you
                # are actually in were the hardest to read of all eight.
                # The current row therefore gets full-strength TEXT for
                # every element; the other three keep the muted tone.
                # Bold at the SAME size (F_PHASE_META_B), not a larger
                # font — weight adds emphasis without shifting the row's
                # height or breaking the column alignment across all four.
                _meta_fg = self.T("TEXT") if _live else self.T("TEXT3")
                _meta_font = F_PHASE_META_B if _live else F_PHASE_META
                if pct.winfo_exists():
                    pct.config(text=f"{int(frac * 100)}%", fg=_meta_fg,
                               font=_meta_font)
                if rng is not None and rng.winfo_exists():
                    rng.config(fg=_meta_fg, font=_meta_font)
                if name.winfo_exists():
                    name.config(fg=self.T("TEXT") if _live else self.T("TEXT2"))
                for _w in entry.get("row", ()):
                    try:
                        if _w.winfo_exists():
                            _w.config(bg=row_bg)
                    except Exception:
                        pass
                # Swatch is a Canvas — its drawn dot needs the new bg too.
                # Filled only on the live row, a hollow ring elsewhere:
                # four solid colour dots were a second full-strength
                # colour system running alongside the bars, saying the
                # same thing twice.
                _sw = entry.get("row", (None,))[0]
                if _sw is not None and _sw.winfo_exists():
                    _sw.delete("all")
                    if _live:
                        _sw.create_oval(1, 1, 12, 12, fill=col, outline="")
                    else:
                        _sw.create_oval(2, 2, 11, 11, fill="",
                                        outline=self.T("TEXT3"), width=1)
            except Exception as e:
                log.debug("phase bar draw[%s]: %s", key, e)

    # ── Clock ─────────────────────────────────────────────────────────────────
    def _draw_clock_face(self):
        """Draw the whole clock CARD: rounded surface, analog face,
        digital time, seconds and the two date lines — all as items on
        one canvas, vertically stacked and horizontally centred as a
        single group."""
        c = self.clock_cv
        bg = getattr(self, "_clock_bg", "#E8F8F5")
        W = max(c.winfo_width(), _CLOCK_SZ + _CARD_PAD * 2)
        H = int(c["height"])
        sz = _CLOCK_SZ
        r = _ck(70)
        cx = W / 2
        cy = _CARD_PAD + sz / 2      # analog face sits at the card's top
        self._clk_cxy = (cx, cy)      # _update_clock reuses this exactly

        # Theme-specific clock colors — ALL fully separated from card bg
        _CLK = {
            # face       shadow1    shadow2    num        hour       ring_bg
            # ring_fg    dot
            "focus": ("#FFFFFF", "#C7D7FF", "#AABFFF", "#1E3A8A", "#2960E6", "#EEF2FF", "#2960E6", "#F59E0B"),  # noqa: E501 (aligned colour table / unpack — clearer on one line)
            "warroom": ("#101014", "#051015", "#030A0D", "#22D3EE", "#06B6D4", "#061820", "#22D3EE", "#FBBF24"),  # noqa: E501 (aligned colour table / unpack — clearer on one line)
            "energy": ("#FFFFFF", "#FECACA", "#FCA5A5", "#991B1B", "#D02222", "#FEE2E2", "#D02222", "#A15904"),  # noqa: E501 (aligned colour table / unpack — clearer on one line)
            "corporate": ("#FFFBEB", "#FDE68A", "#FCD34D", "#92400E", "#AE5009", "#FEF3C7", "#AE5009", "#0C4A6E"),  # noqa: E501 (aligned colour table / unpack — clearer on one line)
            "journey": ("#161B19", "#070908", "#040605", "#4CE0A0", "#38B384", "#17211D", "#4CE0A0", "#F5C451"),  # noqa: E501 (aligned colour table / unpack — clearer on one line)
            "rize": ("#FFFFFF", "#E5E7EB", "#D1D5DB", "#312E81", "#5255EF", "#EEF2FF", "#5255EF", "#A15904"),  # noqa: E501 (aligned colour table / unpack — clearer on one line)
        }
        face_col, shadow1, shadow2, num_col, hour_col, ring24_bg, ring24_fg, dot_col = _CLK[self._mode]  # noqa: E501 (aligned colour table / unpack — clearer on one line)
        min_col = ring24_fg
        sec_col = "#E84040"

        c.delete("all")
        c.create_rectangle(0, 0, W, H, fill=bg, outline="")

        # ── ROUNDED CARD holding clock + time + date ─────────────────────────
        # Drawn on the canvas because Tk widgets cannot have rounded
        # corners at all — a Canvas is the only surface where a radius is
        # achievable. The "shadow" is an offset solid-colour copy, not a
        # real blur: Tk has no blur or alpha compositing, so the spec's
        # `0 2 8 rgba(0,0,0,.08)` is approximated, not reproduced.
        _round_rect(c, 3, 4, W - 1, H - 1, _CARD_RADIUS,
                    fill=_SHADOW[self._mode])
        _round_rect(c, 1, 1, W - 3, H - 4, _CARD_RADIUS, fill=face_col)

        # ── CLOCK FACE — off by default ──────────────────────────────────────
        # The analog dial is the second thing that dated this app.
        # A 60-tick face with amber hour dots, 12 numerals and three
        # coloured hands is roughly 90 drawn items competing with the
        # digital time directly beneath it — and it answers a question
        # ("what time is it?") that the digital readout already answers
        # better, in a card whose real job is "how much of today is
        # left". Tk can't antialias any of it either, so every tick and
        # numeral renders with hard jagged edges no modern UI would ship.
        #
        # Kept behind a setting rather than deleted: some people do
        # prefer a dial, and the drawing code is correct — it just
        # shouldn't be the default. Settings -> Appearance -> Analog clock.
        _show_face = bool(self._settings.get("analog_clock", False))
        # Stale ids from a previous draw would make _update_clock move
        # hands that no longer exist.
        for _a in ("h_hand", "m_hand", "s_hand"):
            self.__dict__.pop(_a, None)

        if _show_face:
            c.create_oval(cx - r, cy - r, cx + r, cy + r,
                          fill=face_col, outline=ring24_bg, width=1)

            # Tick color — slightly more visible than ring bg
            _TICK = {
                "focus": "#8CBFB0",
                "warroom": "#005040",
                "energy": "#F0A878",
                "corporate": "#3730A3",
                "journey": "#49836A",
                "rize": "#C7D2FE",
            }
            tick_col = _TICK[self._mode]

            # Tick marks + theme-colored dots at hour positions
            _dot_r = _ck(3.5)
            for i in range(60):
                angle = math.radians(i * 6 - 90)
                cos_a, sin_a = math.cos(angle), math.sin(angle)
                if i % 5 == 0:
                    dx = cx + (r - _ck(9)) * cos_a
                    dy = cy + (r - _ck(9)) * sin_a
                    c.create_oval(dx - _dot_r, dy - _dot_r,
                                  dx + _dot_r, dy + _dot_r,
                                  fill=dot_col, outline="")
                else:
                    r1, r2 = r - _ck(7), r - _ck(2)
                    c.create_line(cx + r1 * cos_a, cy + r1 * sin_a,
                                  cx + r2 * cos_a, cy + r2 * sin_a,
                                  fill=tick_col, width=1)

            # Numbers
            for i, h in enumerate([12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]):
                angle = math.radians(i * 30 - 90)
                c.create_text(cx + (r - _ck(22)) * math.cos(angle),
                              cy + (r - _ck(22)) * math.sin(angle),
                              text=str(h), fill=num_col,
                              font=F_SMALL_B)

            # Hands
            self.h_hand = c.create_line(cx, cy, cx, cy - _ck(38),
                                        fill=hour_col, width=6, capstyle="round")
            self.m_hand = c.create_line(cx, cy, cx, cy - _ck(58),
                                        fill=min_col, width=4, capstyle="round")
            self.s_hand = c.create_line(cx, cy, cx, cy - _ck(68),
                                        fill=sec_col, width=2, capstyle="round")

            # Center pin — slightly larger than before (spec), themed
            _cap = _ck(9)
            c.create_oval(cx - _cap, cy - _cap, cx + _cap, cy + _cap,
                          fill=dot_col, outline=tick_col)
            c.create_oval(cx - _ck(3.5), cy - _ck(3.5),
                          cx + _ck(3.5), cy + _ck(3.5),
                          fill=face_col, outline="")

        # ── DIGITAL TIME + SECONDS + DATE ────────────────────────────────────
        # Design principle #1 — "what time is it?" answered first, so the
        # hour:minute is the largest thing on the card and the ticking
        # seconds sit UNDER it (not beside it, which made one long noisy
        # line) right-aligned to its edge, staying clearly secondary.
        now = datetime.now()
        pcol = _PANEL_COLORS[self._mode]
        # With the dial hidden the time starts at the top of the card
        # instead of below where the face used to be — otherwise the
        # card keeps a ~150px hole where the clock was.
        y = (cy + r + _GAP_CLOCK_TIME) if _show_face else (_CARD_PAD + 2)
        self._clk_time_id = c.create_text(
            cx, y, text=now.strftime("%I:%M %p"), fill=num_col,
            font=F_CLOCK_HERO, anchor="n")
        tb = c.bbox(self._clk_time_id)
        # Seconds go on their OWN LINE, tucked right under the time and
        # right-aligned to its edge. A baseline-aligned variant (seconds
        # beside the time) was tried and reverted — it saved ~28px but
        # read worse; the stacked form is the one that looks right, so
        # the height is spent deliberately rather than optimised away.
        # _GAP_TIME_SEC stays small: at 6px the seconds visibly detached
        # and hung too low.
        self._clk_sec_id = c.create_text(
            (tb[2] if tb else cx), (tb[3] if tb else y + 46) + _GAP_TIME_SEC,
            text=now.strftime(":%S"),
            fill=pcol["sec_text"], font=F_CLOCK_SEC, anchor="ne")
        sb = c.bbox(self._clk_sec_id)
        y = (sb[3] if sb else y + 22) + _GAP_SEC_DATE
        if self._settings.get("lang") == "bn":
            _dtxt = (f"{BN_DAYS[now.weekday()]}\n{now.day} "
                     f"{EN_MONTHS[now.month-1]} {now.year}")
        else:
            _dtxt = now.strftime("%A\n%d %B %Y")
        self._clk_date_id = c.create_text(
            cx, y, text=_dtxt, fill=pcol["sec_text"],
            font=F_CLOCK_DATE, anchor="n", justify="center")

        # ── Auto-fit the card to its ACTUAL content ──────────────────────────
        # The height used to be a constant assembled from guessed text
        # heights, which left a band of dead white space under the date —
        # the exact "clock section is too tall, the task list is starved"
        # problem. Measuring the real bottom edge removes the guesswork,
        # and stays correct if fonts/DPI/locale change the text metrics.
        db = c.bbox(self._clk_date_id)
        if db:
            want = int(db[3] + _CARD_PAD)
            # Resizing fires <Configure>, which calls this method again —
            # only reconfigure on a real change, or that recurses forever.
            if abs(want - H) > 1:
                try:
                    c.config(height=want)
                    self.after_idle(self._draw_clock_face)
                except Exception as _e:
                    log.debug("clock card autofit: %s", _e)

    def _update_clock(self):
        """Update clock hands + redraw 24h ring arc efficiently.

        CLASSIC-only widgets — guarded via _alive() since FOCUS view
        destroys them but the app-level heartbeat (_tick) still calls
        this every 50ms regardless of the active panel-3 view."""
        cv = self._alive("clock_cv")
        if cv is None:
            return
        import datetime as _dt3
        bg = getattr(self, "_clock_bg", "#E8F8F5")
        try:
            cv.config(bg=bg)
        except Exception as _e:
            log.debug("suppressed: %s", _e)

        now = _dt3.datetime.now()
        # Centre must match _draw_clock_face EXACTLY. It's stored there
        # (not recomputed here) because cx now depends on the canvas's
        # actual width, which only the draw pass knows.
        cx, cy = getattr(self, "_clk_cxy", (_CLOCK_SZ / 2, _CLOCK_SZ / 2))
        h = now.hour % 12 + now.minute / 60 + now.second / 3600
        m = now.minute + now.second / 60
        s = now.second + now.microsecond / 1e6

        def tip(v, tot, length):
            a = math.radians(v / tot * 360 - 90)
            return cx + length * math.cos(a), cy + length * math.sin(a)

        # Hands only exist when the analog dial is switched on (it is off
        # by default now — see _draw_clock_face). Without this guard the
        # missing attributes would raise 20 times a second.
        if hasattr(self, "h_hand"):
            hx, hy = tip(h, 12, _ck(38))
            mx, my = tip(m, 60, _ck(58))
            sx, sy = tip(s, 60, _ck(68))
            try:
                cv.coords(self.h_hand, cx, cy, hx, hy)
                cv.coords(self.m_hand, cx, cy, mx, my)
                cv.coords(self.s_hand, cx, cy, sx, sy)
            except Exception as _e:
                log.debug("clock hands: %s", _e)
        # Digital time and seconds are canvas items on the same card, so
        # they're updated with itemconfig rather than widget .config().
        # Only the SECONDS tick every second; the hour:minute text is
        # rewritten on the minute redraw below, so we avoid re-laying out
        # the big text 20x/second for no visible change.
        _sid = getattr(self, "_clk_sec_id", None)
        if _sid is not None:
            try:
                cv.itemconfig(_sid, text=now.strftime(":%S"))
            except Exception as _e:
                log.debug("sec item: %s", _e)

        # Redraw clock face + phase bars every minute (only when
        # seconds == 0 or on init) — this is also what refreshes the
        # hour:minute text and the date.
        if now.second == 0 or not hasattr(
                self, "_last_ring_min") or self._last_ring_min != now.minute:
            self._last_ring_min = now.minute
            self._draw_clock_face()
            # Re-update hands since redraw resets them
            self.clock_cv.coords(self.h_hand, cx, cy, hx, hy)
            self.clock_cv.coords(self.m_hand, cx, cy, mx, my)
            self.clock_cv.coords(self.s_hand, cx, cy, sx, sy)
            self._draw_phase_bars()

        # day_lbl_goal is updated unconditionally — it used to sit after
        # an early `return` guarding the (now removed) date_lbl, so it
        # silently stopped updating whenever that label was absent.
        # (the 1px hidden "DAY N" placeholder this used to feed is gone —
        # it was invisible by construction and nothing else read it)

    # ── Mind / Opportunity Notes ──────────────────────────────────────────────
    def _save_mind_note(self, event=None):
        try:
            txt = self.mind_box.get("1.0", "end").strip()
            self._mind_note = txt
            self.vision_data["_mind_note"] = txt
            save_data(self)
        except Exception:
            pass

    def _save_opp_note(self, event=None):
        try:
            txt = self.opp_box.get("1.0", "end").strip()
            self.vision_data["_opp_note"] = txt
            save_data(self)
        except Exception:
            pass

    # ── Work Timer ────────────────────────────────────────────────────────────
    def _toggle_work(self):
        self.work_running = not self.work_running
        yel = self.T("YELLOW")
        green = self.T("GREEN")
        btn = self._alive("work_play_btn")
        if btn is None:
            return
        if self.work_running:
            btn.config(text="⏸", bg=yel,
                       activebackground=yel, activeforeground="#fff")
        else:
            btn.config(text="▶", bg=green,
                       activebackground=green, activeforeground="#fff")

    def _reset_work(self):
        self.work_running = False
        self.work_secs = 0.0
        btn = self._alive("work_play_btn")
        if btn is not None:
            btn.config(text="▶", bg=self.T("GREEN"))
        lbl = self._alive("work_lbl")
        lbl_ms = self._alive("work_lbl_ms")
        _main, _ms = fmt_ms_parts(0)
        if lbl is not None:
            lbl.config(text=_main)
        if lbl_ms is not None:
            lbl_ms.config(text=_ms)
        save_data(self)

    # ── Music ─────────────────────────────────────────────────────────────────
    def _browse_music(self):
        p = filedialog.askopenfilename(
            title="Select Music",
            filetypes=[("Audio", "*.mp3 *.wav *.ogg *.flac *.aac *.m4a"),
                       ("All", "*.*")])
        if p:
            self._music_file = p

    def _music_play(self):
        if not self._music_file:
            self._browse_music()
        if not self._music_file:
            return
        self._music_stop()
        try:
            if sys.platform == "win32":
                wmp = os.path.join(
                    os.environ.get(
                        "ProgramFiles",
                        "C:\\Program Files"),
                    "Windows Media Player",
                    "wmplayer.exe")
                if os.path.exists(wmp):
                    self._music_proc = subprocess.Popen(
                        [wmp, "/play", "/close", self._music_file],
                        creationflags=subprocess.CREATE_NO_WINDOW)
                else:
                    os.startfile(self._music_file)
            elif sys.platform == "darwin":
                self._music_proc = subprocess.Popen(["afplay", self._music_file])
            else:
                self._music_proc = subprocess.Popen(["xdg-open", self._music_file])
        except Exception:
            try:
                os.startfile(self._music_file)
            except Exception:
                pass

    def _music_stop(self):
        """Stop any playing background music."""
        if self._music_proc:
            try:
                self._music_proc.terminate()
            except Exception:
                pass
            self._music_proc = None

    # ── Goal dialog ───────────────────────────────────────────────────────────
    def _add_goal(self):
        pass  # all adding through dialog buttons in right panel

    def _open_add_goal_dialog(self, gtype, accent, bg_light):
        win = tk.Toplevel(self)
        win.title("Add Goal")
        win.geometry("360x300+300+200")
        win.configure(bg=bg_light)
        win.resizable(False, False)
        win.attributes("-topmost", True)
        win.grab_set()

        tk.Frame(win, bg=accent, height=4).pack(fill="x")
        tk.Label(win, text="New Goal", bg=bg_light, fg=accent,
                 font=F_H1).pack(anchor="w", padx=SP4, pady=(10, 4))

        tk.Label(win, text="Goal Title *", bg=bg_light, fg=self.T("TEXT2"),
                 font=F_XS).pack(anchor="w", padx=SP4)
        title_e = tk.Entry(win, bg=self.T("WHITE"), fg=self.T("TEXT"),
                           font=F_BODY, relief="flat",
                           highlightthickness=1, highlightbackground=accent,
                           insertbackground=self.T("TEXT"))
        title_e.pack(fill="x", padx=SP4, ipady=5)
        title_e.focus()

        tk.Label(win, text="Start Date (YYYY-MM-DD)", bg=bg_light,
                 fg=self.T("TEXT2"), font=F_XS
                 ).pack(anchor="w", padx=SP4, pady=(8, 0))
        date_e = tk.Entry(win, bg=self.T("WHITE"), fg=self.T("TEXT"),
                          font=F_BODY, relief="flat",
                          highlightthickness=1, highlightbackground=accent,
                          insertbackground=self.T("TEXT"))
        date_e.insert(0, str(date.today()))
        date_e.pack(fill="x", padx=SP4, ipady=4)

        tk.Label(win, text="Notes / Details", bg=bg_light,
                 fg=self.T("TEXT2"), font=F_XS
                 ).pack(anchor="w", padx=SP4, pady=(8, 0))
        note_e = tk.Text(win, bg=self.T("WHITE"), fg=self.T("TEXT"),
                         font=F_SMALL, relief="flat",
                         highlightthickness=1, highlightbackground=accent,
                         height=4, insertbackground=self.T("TEXT"), wrap="word")
        note_e.pack(fill="x", padx=SP4)

        bf = tk.Frame(win, bg=bg_light)
        bf.pack(fill="x", padx=SP4, pady=(10, 12))

        def do_add():
            ttl = title_e.get().strip()
            if not ttl:
                return
            sd = date_e.get().strip() or str(date.today())
            try:
                date.fromisoformat(sd)
            except ValueError:
                sd = str(date.today())
            getattr(self, gtype).append({
                "id": int(time.time() * 1000),
                "text": ttl,
                "done": False,
                "start_date": sd,
                "note": note_e.get("1.0", "end").strip(),
                "day": day_number(self.start_date),
            })
            save_data(self)
            self._render_goals(gtype)
            win.destroy()

        tk.Button(bf, text="  Add Goal  ", command=do_add,
                  bg=accent, fg="#FFFFFF", relief="flat",
                  font=F_SMALL_B, cursor="hand2", bd=0,
                  activebackground=accent, activeforeground="#fff"
                  ).pack(side="left")
        tk.Button(bf, text="  Cancel  ", command=win.destroy,
                  bg=_PANEL_COLORS[self._mode]["ctrl_bg"],
                  fg=self.T("TEXT"), relief="flat",
                  font=F_SMALL, cursor="hand2", bd=0
                  ).pack(side="left", padx=(8, 0))
        title_e.bind("<Return>", lambda e: do_add())

    def _delete_goal(self, gtype, gid):
        # In place. self.yearly/.monthly/.weekly are ALIASES of the lists
        # stored under the selected project (see _bind_goal_lists) — a
        # reassignment here would silently detach the alias and every
        # later edit would land in a list nothing saves.
        _lst = getattr(self, gtype)
        _lst[:] = [g for g in _lst if g["id"] != gid]
        save_data(self)
        self._render_goals(gtype)

    def _toggle_goal(self, gtype, gid):
        for g in getattr(self, gtype):
            if g["id"] == gid:
                g["done"] = not g["done"]
                if g["done"] and not g.get("done_date"):
                    g["done_date"] = str(date.today())
                elif not g["done"]:
                    g.pop("done_date", None)
                break
        save_data(self)
        self._render_goals(gtype)

    def _toggle_note(self, gtype, gid):
        for g in getattr(self, gtype):
            if g["id"] == gid:
                g["_note_open"] = not g.get("_note_open", False)
                break
        self._render_goals(gtype)

    def _edit_goal_note(self, gtype, gid, accent, bg_light):
        goal = next((g for g in getattr(self, gtype) if g["id"] == gid), None)
        if not goal:
            return
        win = tk.Toplevel(self)
        win.title("Edit Goal")
        win.geometry("360x280+300+250")
        win.configure(bg=bg_light)
        win.resizable(False, False)
        win.attributes("-topmost", True)
        win.grab_set()
        tk.Frame(win, bg=accent, height=4).pack(fill="x")
        tk.Label(win, text="Edit Goal", bg=bg_light, fg=accent,
                 font=F_H2).pack(anchor="w", padx=SP3, pady=(8, 2))
        for lbl, key, height in [("Title", "text", None),
                                 ("Start Date", "start_date", None),
                                 ("Notes", "note", 4)]:
            tk.Label(win, text=lbl, bg=bg_light, fg=self.T("TEXT2"),
                     font=F_XS).pack(anchor="w", padx=SP3, pady=(6, 0))
            if height:
                w = tk.Text(win, bg=self.T("WHITE"), fg=self.T("TEXT"),
                            font=F_SMALL, relief="flat", highlightthickness=1,
                            highlightbackground=accent, height=height,
                            insertbackground=self.T("TEXT"), wrap="word")
                w.insert("1.0", goal.get(key, ""))
                w.pack(fill="x", padx=SP3)
                if key == "note":
                    note_w = w
            else:
                w = tk.Entry(win, bg=self.T("WHITE"), fg=self.T("TEXT"),
                             font=F_BODY, relief="flat", highlightthickness=1,
                             highlightbackground=accent,
                             insertbackground=self.T("TEXT"))
                w.insert(0, goal.get(key, ""))
                w.pack(fill="x", padx=SP3, ipady=4)
                if key == "text":
                    title_w = w
                else:
                    date_w = w

        def save(e=None):
            t = title_w.get().strip()
            d = date_w.get().strip()
            if t:
                goal["text"] = t
            try:
                date.fromisoformat(d)
                goal["start_date"] = d
            except ValueError:
                pass
            goal["note"] = note_w.get("1.0", "end").strip()
            save_data(self)
            self._render_goals(gtype)
            win.destroy()

        bf = tk.Frame(win, bg=bg_light)
        bf.pack(fill="x", padx=SP3, pady=(8, 10))
        tk.Button(bf, text="  Save  ", command=save, bg=accent, fg="#FFFFFF",
                  relief="flat", font=F_SMALL_B, cursor="hand2", bd=0
                  ).pack(side="left")
        tk.Button(bf, text="  Cancel  ", command=win.destroy,
                  bg="#ccc", fg=self.T("TEXT"), relief="flat",
                  font=F_SMALL, cursor="hand2", bd=0
                  ).pack(side="left", padx=(6, 0))

    def _render_goals(self, gtype):
        """Re-render goal cards for the given goal type."""
        inner = getattr(self, f"_{gtype}_inner")
        accent = getattr(self, f"_{gtype}_accent")
        bg_light = getattr(self, f"_{gtype}_bglt")
        stats_lbl = getattr(self, f"_{gtype}_stats")

        for w in inner.winfo_children():
            w.destroy()
        goals = getattr(self, gtype)
        done_count = sum(1 for g in goals if g.get("done"))
        stats_lbl.config(text=f"{done_count} / {len(goals)}")

        if not goals:
            # One friendly message for all three sections — the header
            # right above already says which horizon this is, so naming it
            # again ("No short-term goals yet") only repeated it.
            _empty_state(inner, bg_light, self.T("TEXT3"), "\u25CE",
                         "No goals yet",
                         "Click  + Add  to create your first goal.")
            return

        # Sort: not-done first, done at bottom — no section labels
        active_goals = [g for g in goals if not g.get("done")]
        done_goals = [g for g in goals if g.get("done")]
        row_idx = 0
        for g in active_goals:
            row_idx = self._render_one_goal(inner, g, gtype, accent, bg_light, row_idx, done=False)
        for g in done_goals:
            row_idx = self._render_one_goal(inner, g, gtype, accent, bg_light, row_idx, done=True)

    def _render_one_goal(self, inner, g, gtype, accent, bg_light, row_idx, done):
        gid = g["id"]
        note_open = g.get("_note_open", False)
        note_txt = g.get("note", "").strip()
        start_str = g.get("start_date", str(date.today()))
        done_date = g.get("done_date", "")
        try:
            days_elapsed = (date.today() - date.fromisoformat(start_str)).days
        except Exception:
            days_elapsed = 0

        _pc = _PANEL_COLORS[self._mode]
        if done:
            card_bg = _pc["task_alt"]
            strip_col = self.T("DONE_GREEN")
            title_fg = _pc["muted"]
            meta_fg = _pc["muted"]
        else:
            card_bg = _pc["card2"]
            strip_col = accent
            title_fg = THEMES[self._mode]["TEXT"]
            meta_fg = _pc["sec_text"]

        # All themes: clean card with border, no shadow tricks
        _shadow_col = {
            "focus": "#C8D4CC",
            "warroom": "#0A1A30",
            "energy": "#F0C8A8",
            "corporate": "#E0D8CC",
            "journey": "#070908",
            "rize": "#DDE1E6"}
        shadow = tk.Frame(inner, bg=_shadow_col[self._mode])
        shadow.grid(row=row_idx, column=0, sticky="ew", padx=SP2, pady=(3, 6))
        shadow.columnconfigure(0, weight=1)
        card = tk.Frame(shadow, bg=card_bg, highlightthickness=0)
        card.grid(row=0, column=0, sticky="ew", padx=(0, 1), pady=(0, 2))
        card.columnconfigure(1, weight=1)
        row_idx += 1

        # Left strip — ONLY color signal, 4px
        tk.Frame(card, bg=strip_col, width=4).grid(
            row=0, column=0, rowspan=4, sticky="ns")

        # ── Title row — full width, nothing else sits here so long task
        # text has all the room it needs instead of fighting the action
        # icons for space. ─────────────────────────────────────────────
        top = tk.Frame(card, bg=card_bg)
        top.grid(row=0, column=1, sticky="ew", padx=(14, 10), pady=(12, 2))
        top.columnconfigure(0, weight=1)

        # Title — single line, no wrap, truncate long text. Goal text had
        # no casing rule at all before (unlike task rows, which forced
        # ALL CAPS) — whatever case the user happened to type in showed
        # verbatim, so two goals typed with different habits ("decipline"
        # vs "CONSISTANCY") looked visually inconsistent next to each
        # other. Title Case now, same smart rule as task rows.
        raw_text = _title_case(g["text"])
        title_lbl = tk.Label(top,
                             text=raw_text,
                             bg=card_bg, fg=title_fg,
                             font=F_H3,
                             anchor="w", wraplength=0, justify="left"
                             )
        title_lbl.grid(row=0, column=0, sticky="ew")

        # Action buttons — moved down to share the meta row with the
        # date/day info instead of squeezing the title row.
        meta_row = tk.Frame(card, bg=card_bg)
        meta_row.grid(row=2, column=1, sticky="ew", padx=(14, 10),
                      pady=(4, 10))
        meta_row.columnconfigure(0, weight=1)
        ab = tk.Frame(meta_row, bg=card_bg)
        ab.grid(row=0, column=1, sticky="e")

        muted = _pc["muted"]
        done_green = self.T("DONE_GREEN")
        _del_color = _pc["del_hover"]

        # These 4 buttons sat 1px apart with identical grey — same size,
        # same weight, same spacing as each other, so nothing told the
        # eye where one button ended and the next began; they read as
        # one grey smear, not four distinct controls. 6px between each
        # is enough gap to see four buttons instead of a cluster, without
        # spreading the row out much.

        # Done toggle — the one action on this row that's actually
        # meaningful (marking a goal achieved), unlike edit/note/delete
        # which are all housekeeping. It used to share `muted`, the
        # faintest tone, with all three of those; sec_text is one step
        # more visible so it reads as slightly more important without
        # going all the way to a filled accent block like the task
        # card's ▶ — a goal isn't "started/stopped", so it doesn't need
        # that level of shouting, just a small nudge ahead of the rest.
        _done_fg = done_green if done else _pc["sec_text"]
        _done_btn = tk.Button(ab,
                              text="✓" if done else "○",
                              bg=card_bg,
                              fg=_done_fg,
                              relief="flat", font=F_BODY,
                              cursor="hand2", bd=0, padx=SP1,
                              activebackground=card_bg,
                              activeforeground=done_green,
                              command=lambda t=gtype, x=gid: self._toggle_goal(t, x))
        _done_btn.pack(side="left", padx=(1, 6))
        _hover(_done_btn, card_bg, _pc["active_btn"], _done_fg, done_green)

        # Edit
        _edit_btn = tk.Button(ab, text="✎", bg=card_bg, fg=muted,
                              relief="flat", font=F_BODY, cursor="hand2", bd=0,
                              padx=SP1, activebackground=card_bg, activeforeground=accent,
                              command=lambda t=gtype, x=gid, ac=accent, bgl=bg_light:
                              self._edit_goal_note(t, x, ac, bgl))
        _edit_btn.pack(side="left", padx=(0, 6))
        _hover(_edit_btn, card_bg, _pc["active_btn"], muted, accent)

        # Note toggle
        _note_btn = tk.Button(ab,
                              text="▾" if note_open else "▸",
                              bg=card_bg, fg=accent if note_txt else muted,
                              relief="flat", font=F_BODY, cursor="hand2", bd=0,
                              padx=SP2, pady=2, activebackground=card_bg,
                              command=lambda t=gtype, x=gid: self._toggle_note(t, x))
        _note_btn.pack(side="left", padx=(0, 6))
        _hover(_note_btn, card_bg, _pc["active_btn"])

        # Delete
        _del_btn = tk.Button(ab, text="✕", bg=card_bg, fg=muted,
                             relief="flat", font=F_SMALL, cursor="hand2", bd=0,
                             padx=SP1, activeforeground=_del_color,
                             activebackground=card_bg,
                             command=lambda t=gtype, x=gid: self._delete_goal(t, x))
        _del_btn.pack(side="left", padx=(0, 6))
        _hover(_del_btn, card_bg, _pc["active_btn"], muted, _del_color)

        # Click press-depth — these 4 had hover but no press feedback,
        # unlike panel 3's buttons; a click felt unacknowledged.
        for _b in (_done_btn, _edit_btn, _note_btn, _del_btn):
            self._press_depth(_b)

        # ── Day progress bar — 7px, up from 3. At 3px this carried real
        # data (days elapsed / 30) that was functionally invisible —
        # fill vs. empty was indistinguishable at a glance, so two goals
        # at very different points in their 30 days looked identical.
        # Same fix as the project cards' top strip (6px -> 10px): still
        # a thin bar, not a fat one, but thick enough to actually read.
        _PB_H = 7
        pb_bg = _pc["pb_empty"]
        pb_frame = tk.Frame(card, bg=card_bg)
        pb_frame.grid(row=1, column=1, sticky="ew", padx=(14, 10), pady=(4, 0))
        pb_frame.columnconfigure(0, weight=1)
        pb_cv = tk.Canvas(pb_frame, bg=pb_bg, height=_PB_H, highlightthickness=0)
        pb_cv.pack(fill="x")

        def _draw_day_bar(e=None, cv=pb_cv, d=days_elapsed, dn=done, ac=accent):
            w = cv.winfo_width()
            if w < 2:
                return
            cv.delete("all")
            pct = min(d / 30, 1.0)
            fill = int(w * pct)
            cv.create_rectangle(0, 0, w, _PB_H, fill=pb_bg, outline="")
            if fill > 0:
                cv.create_rectangle(0, 0, fill, _PB_H,
                                    fill=self.T("DONE_GREEN") if dn else ac, outline="")
        pb_cv.bind("<Configure>", _draw_day_bar)

        # ── Meta — date + day count, 12px, muted. Lives in the same
        # meta_row as the action buttons (meta_row was gridded onto
        # the card back up in the title-row block, next to `ab`). ────
        meta = tk.Frame(meta_row, bg=card_bg)
        meta.grid(row=0, column=0, sticky="w")
        tk.Label(meta, text=f"📅 {start_str}",
                 bg=card_bg, fg=meta_fg, font=F_XS
                 ).pack(side="left")
        day_val = days_elapsed + 1
        # "Xd running" reads as an instant, at-a-glance signal for an
        # active task without costing much width ("d" instead of the
        # full word "day"); once done, "running" no longer applies —
        # the ✓ done-date label right after this already covers that.
        #
        # Colour: this used to be `accent` — the same colour as the real
        # clickable buttons two inches to its right, but it's plain text,
        # not a link. Sitting in accent right next to the muted 📅 date
        # made it read as "this one's interactive, that one isn't" with
        # no actual difference in behaviour. meta_fg (same as the date)
        # keeps it legible as a fact, not a false affordance.
        #
        # "· N/30" appended: the bar right above this line carries real
        # progress data, but reading it required a hover — the tooltip
        # was the ONLY place the actual number existed. Reusing this
        # existing label instead of adding a new widget keeps the row's
        # layout untouched while making that number permanently visible.
        _bar_frac = f" · {min(day_val, 30)}/30" if not done else ""
        day_txt = (f"   {day_val}d{_bar_frac}" if done
                   else f"   {day_val}d running{_bar_frac}")
        tk.Label(meta, text=day_txt,
                 bg=card_bg,
                 fg=done_green if done else meta_fg,
                 font=F_XS
                 ).pack(side="left")
        if done and done_date:
            tk.Label(meta, text=f"   ✓ {done_date}",
                     bg=card_bg, fg=done_green,
                     font=F_XS).pack(side="left")

        # The thin bar under the title is a 30-day progress indicator,
        # not decoration — it was unlabeled before, so it read as an
        # arbitrary underline. A tooltip makes the meaning explicit
        # without adding any permanent visual clutter to the card.
        _add_tooltip(
            pb_cv, f"Day {day_val} of 30 — {min(day_val, 30)}/30 progress")

        # ── Note panel ────────────────────────────────────────────────────
        if note_open:
            np_bg = _pc["note_bg"]
            note_panel = tk.Frame(card, bg=np_bg, highlightthickness=0)
            note_panel.grid(row=3, column=1, sticky="ew",
                            padx=(14, 10), pady=(0, 10))
            note_panel.columnconfigure(0, weight=1)
            if note_txt:
                tk.Label(note_panel, text="Notes",
                         bg=np_bg,
                         fg=_pc["muted"],
                         font=F_XS, anchor="w"
                         ).grid(row=0, column=0, sticky="w", padx=SP2, pady=(6, 2))
                tk.Label(note_panel, text=note_txt,
                         bg=np_bg,
                         fg=THEMES[self._mode]["TEXT"],
                         font=F_SMALL, anchor="w",
                         wraplength=240, justify="left"
                         ).grid(row=1, column=0, sticky="w", padx=SP2, pady=(0, 8))
            else:
                tk.Label(note_panel,
                         text="No notes yet. Click ✎ to add.",
                         bg=np_bg,
                         fg=_pc["muted"],
                         font=F_XS
                         ).grid(row=0, column=0, sticky="w", padx=SP2, pady=SP2)

        return row_idx

    # ── Tasks ─────────────────────────────────────────────────────────────────
    def _show_task_input(self):
        # Same reasoning as the guard in _render_tasks: the task input
        # only exists on the FOCUS tab now, but a keyboard shortcut can
        # still fire this while PLAN is showing.
        if self._alive("_task_inp_frame") is None:
            return
        self._task_inp_frame.grid(row=2, column=0, sticky="ew")
        self.task_entry.focus_set()

    def _quick_add_chip(self, text):
        """One-click empty-state suggestion — opens the normal inline
        input pre-filled with the suggested task text (rather than
        adding it silently), so the user can still edit or cancel
        exactly like a manually-typed task."""
        self._show_task_input()
        self.task_entry.delete(0, "end")
        self.task_entry.insert(0, text)
        self.task_entry.icursor("end")

    def _hide_task_input(self):
        self.task_entry.delete(0, "end")
        self._task_inp_frame.grid_remove()

    def _add_task(self):
        text = self.task_entry.get().strip()
        if not text:
            return
        # Parkinson's Law: optional time-box — type "write intro ~45" = 45 min cap
        est = 0
        import re as _re
        m = _re.search(r"~\s*(\d+)\s*m?$", text)
        if m:
            est = int(m.group(1))
            text = text[:m.start()].strip() or text
        # New tasks land on whichever day the list is currently showing,
        # so "switch to Tomorrow, then add" plans tomorrow directly.
        _lst = self._task_list()
        _new = {"id": int(time.time() * 1000), "text": text,
                "done": False, "secs": 0.0, "sessions": [],
                "est": est, "mit": False,
                "day": self._task_day_str()}
        _lst.append(_new)

        def _undo(_l=_lst, _n=_new):
            try:
                _l.remove(_n)
            except ValueError:
                pass
        self._push_undo('add "%s"' % text[:30], _undo)
        self._hide_task_input()
        save_data(self)
        self._render_tasks()

    # ── Today / Tomorrow planning ───────────────────────────────────────────
    # Not a third task list (a third place to lose a task) — every task
    # carries the DAY it belongs to, so "Tomorrow" is just a filter and at
    # rollover the same comparison starts matching. Nothing migrates.
    def _task_day_str(self):
        """ISO date the task list is currently showing."""
        import datetime as _dtd
        d = date.today()
        if getattr(self, "_task_day", "today") == "tomorrow":
            d = d + _dtd.timedelta(days=1)
        return str(d)

    def _set_task_day(self, which):
        if getattr(self, "_task_day", "today") == which:
            return
        self._task_day = which
        self._settings["task_day"] = which
        save_data(self)
        self._apply_theme(self._mode)   # rebuild so the toggle restyles

    def _task_matches_day(self, t):
        """Which day-view a task belongs to.

        TODAY deliberately matches `day <= today`, not `day == today`.
        An exact match would make an unfinished task silently vanish at
        midnight — it isn't deleted, but it stops being visible anywhere,
        which is worse than losing it outright because the user can't
        tell. Carrying overdue work forward is also exactly the Zeigarnik
        behaviour the rest of this app is built on: unfinished stays in
        sight until it's actually done.

        TOMORROW matches anything dated LATER than today. The two rules
        are then exhaustive (`d <= today` OR `d > today` covers every
        date), so no task can ever be invisible in both views — a gap an
        exact match leaves open if the clock moves backwards.

        Tasks with no `day` at all (created before this feature) are
        treated as today's, so nothing an existing user wrote disappears."""
        _today = str(date.today())
        d = t.get("day", _today)
        if getattr(self, "_task_day", "today") == "tomorrow":
            return d > _today
        return d <= _today

    def _reorder_task(self, view, from_i, to_i):
        """Move a task within the REAL list, using view positions.

        BUG THIS FIXES: dragging a task to a new position did nothing.
        _render_tasks builds its `tasks` variable as a filtered, sorted
        COPY of the underlying list, and the drop handler was calling
        pop()/insert() on that copy — so the rows visibly moved, the app
        saved, and the next render rebuilt the copy from an untouched
        source list and put everything straight back. It failed silently
        and looked exactly like a stubborn animation glitch.

        The fix has to translate between the two orders. `view` holds
        the rows the user can actually see, which is usually a subset:
        the other day's tasks, anything filtered out, and (on FOCUS) the
        committed tasks all live in the same list but aren't on screen.
        So rather than moving one element, this rewrites only the SLOTS
        those visible tasks occupy, in their new order — every hidden
        task keeps its exact index, and cannot be shuffled by a drag it
        wasn't part of."""
        if from_i == to_i or not view:
            return
        lst = self._task_list()
        try:
            slots = sorted(lst.index(t) for t in view)
        except ValueError:
            return                      # view is stale; a re-render is due
        new_view = list(view)
        moved = new_view.pop(from_i)
        new_view.insert(max(0, min(to_i, len(new_view))), moved)
        before = [lst[s] for s in slots]

        def _undo(_l=lst, _s=slots, _b=before):
            for _i, _t in zip(_s, _b):
                _l[_i] = _t
        for slot, t in zip(slots, new_view):
            lst[slot] = t
        self._push_undo('move "%s"' % (moved.get("text", "")[:30]), _undo)
        save_data(self)
        self._render_tasks()

    def _set_mit(self, tid):
        """MIT — exactly one Most Important Task highlighted per day,
        per list (CLASSIC and FOCUS each keep their own MIT)."""
        task, lst = self._find_task(tid)
        if task is None:
            return
        _prev = {t["id"]: bool(t.get("mit", False)) for t in lst}
        for t in lst:
            t["mit"] = (t["id"] == tid) and not t.get("mit", False)

        def _undo(_l=lst, _p=_prev):
            for _t in _l:
                if _t["id"] in _p:
                    _t["mit"] = _p[_t["id"]]
        self._push_undo("change MIT", _undo)
        save_data(self)
        self._render_tasks()

    _URGENCY_LEVELS = ("low", "med", "high")

    def _cycle_urgency(self, tid):
        """Tomorrow-only priority tag. Click steps LOW -> MED -> HIGH ->
        LOW. Tasks default to MED (an un-set task is neither dismissed
        nor flagged) rather than starting at LOW, which would make a
        freshly-added task look deliberately deprioritized."""
        task, _lst = self._find_task(tid)
        if task is None:
            return
        cur = task.get("urgency", "med")
        i = self._URGENCY_LEVELS.index(cur) if cur in self._URGENCY_LEVELS else 1
        task["urgency"] = self._URGENCY_LEVELS[(i + 1) % 3]

        def _undo(_t=task, _c=cur):
            _t["urgency"] = _c
        self._push_undo("change priority", _undo)
        save_data(self)
        self._render_tasks()

    def _send_to_today(self, tid):
        """Promote a Tomorrow task onto Today's list. Tasks aren't split
        into separate collections (see _task_matches_day) — this only
        flips the `day` field, so nothing needs to be copied or moved."""
        task, _lst = self._find_task(tid)
        if task is None:
            return
        _prev_day = task.get("day")
        task["day"] = str(date.today())

        def _undo(_t=task, _d=_prev_day):
            if _d is None:
                _t.pop("day", None)
            else:
                _t["day"] = _d
        self._push_undo("move to today", _undo)
        save_data(self)
        self._render_tasks()

    # ── Undo ─────────────────────────────────────────────────────────────
    # A stack of reversible actions rather than the single "last deleted
    # task" slot this used to have.
    #
    # The old design could only undo a deletion, and only by catching the
    # toast before it timed out five seconds later. Everything else — a
    # task ticked off by mis-click, a name edited over, a timer reset —
    # was final the instant it happened. That is the wrong default for a
    # tool holding months of work: the cost of storing thirty closures is
    # nothing, and the cost of one unrecoverable mis-click is the trust
    # you place in the whole app.
    #
    # Each entry is a label plus a closure that puts things back. Storing
    # the closure (not a diff) keeps every action responsible for knowing
    # how to reverse itself, right where the forward action is written.
    _UNDO_MAX = 30

    def _push_undo(self, label, fn):
        stack = getattr(self, "_undo_stack", None)
        if stack is None:
            stack = self._undo_stack = []
        stack.append({"label": label, "undo": fn})
        del stack[:-self._UNDO_MAX]

    def _undo_last(self, event=None):
        """Ctrl+Z. Ignored while typing, so it can't steal the keystroke
        from a text field where the user means the ordinary in-field
        undo (or, in an Entry, means nothing and should stay harmless)."""
        w = event.widget if event is not None else None
        if isinstance(w, (tk.Entry, tk.Text)):
            return None
        stack = getattr(self, "_undo_stack", None)
        if not stack:
            self._show_undo_toast(text="Nothing to undo", on_undo=lambda: None)
            return "break"
        item = stack.pop()
        try:
            item["undo"]()
        except Exception as e:
            log.debug("undo[%s]: %s", item.get("label"), e)
        save_data(self)
        try:
            self._render_tasks()
        except Exception as _e:
            log.debug("undo render: %s", _e)
        self._show_undo_toast(text="Undid: " + item.get("label", "action"),
                              on_undo=lambda: None)
        return "break"

    def _delete_task(self, tid):
        task, lst = self._find_task(tid)
        if task is None:
            self.task_timers.pop(tid, None)
            return
        # Stop the clock BEFORE removing the task, and stop it properly.
        #
        # This used to be a bare task_timers.pop(). Two things went wrong
        # with that: the task's open session kept end=None forever (so a
        # restored task came back with a session that never finished),
        # and — worse — the PROJECT clock it had started was left running
        # with the task that owned it now gone from every list, so
        # nothing on screen could stop it again.
        if tid in self.task_timers:
            self._stop_task_and_project(task)
        self.task_timers.pop(tid, None)
        idx = lst.index(task)
        key = "focus" if lst is self.tasks_focus else "classic"
        self._last_deleted = (key, idx, lst.pop(idx))
        _t = self._last_deleted[2]

        def _undo(_l=lst, _i=idx, _t=_t):
            _l.insert(min(_i, len(_l)), _t)
        self._push_undo('delete "%s"' % (_t.get("text", "")[:30]), _undo)
        save_data(self)
        self._render_tasks()
        self._show_undo_toast()

    def _show_undo_toast(self, host=None, on_undo=None, text="Task deleted"):
        """5-second '<text> — UNDO' toast placed over `host`.

        Generalised so every destructive action in the app can share one
        undo affordance. It used to be hard-wired to panel 3's task list
        (host and callback both fixed), which is why deleting a PROJECT
        sub-task silently had no undo at all while deleting a panel-3
        task did — an inconsistent safety net for two identical-looking
        'delete a task' gestures."""
        try:
            old = getattr(self, "_undo_toast", None)
            if old is not None and old.winfo_exists():
                old.destroy()
            if host is None:
                # task_canvas only exists while FOCUS is the visible tab
                # (PLAN has no task list any more), so fall back to the
                # main window rather than losing the undo affordance.
                _tc = self._alive("task_canvas")
                host = _tc.master if _tc is not None else self
            if on_undo is None:
                # The toast button and Ctrl+Z must be the SAME action,
                # not two that each restore independently. They weren't:
                # the button used _undo_delete (its own _last_deleted
                # slot) while Ctrl+Z popped the undo stack, so clicking
                # UNDO and then pressing Ctrl+Z re-inserted the very same
                # task a second time — one delete, two copies back.
                # Routing the button through the stack means whichever
                # one you reach for, the entry is consumed once.
                on_undo = self._undo_last
            qbg = self.T("QUOTE_BG")
            # per-theme accent readable on QUOTE_BG (energy's bar is red)
            _UNDO_FG = {"focus": "#8AB4FF", "warroom": "#22D3EE",
                        "energy": "#FDE047", "corporate": "#FCD34D",
                        "journey": "#4CE0A0", "rize": "#818CF8"}
            tst = tk.Frame(host, bg=qbg, highlightthickness=1,
                           highlightbackground=self.T("CARD_BORDER"))
            self._undo_toast = tst

            def _fire():
                try:
                    tst.destroy()
                except Exception:
                    pass
                on_undo()
            tk.Label(tst, text=text, bg=qbg, fg="#FFFFFF",
                     font=F_SMALL).pack(side="left", padx=(SP3, SP2), pady=SP1)
            tk.Button(tst, text="UNDO", command=_fire,
                      bg=qbg, fg=_UNDO_FG[self._mode], font=F_SMALL_B,
                      relief="flat", bd=0, cursor="hand2",
                      activebackground=qbg,
                      activeforeground="#FFFFFF"
                      ).pack(side="left", padx=(0, SP3))
            tst.place(relx=0.5, rely=1.0, anchor="s", y=-6)
            tst.after(5000, lambda: (tst.winfo_exists() and tst.destroy()))
        except Exception as e:
            log.debug("undo toast: %s", e)

    def _undo_delete(self):
        try:
            key, idx, task = getattr(self, "_last_deleted", (None, None, None))
            if task is None:
                return
            self._last_deleted = (None, None, None)
            lst = self.tasks_focus if key == "focus" else self.tasks
            lst.insert(min(idx, len(lst)), task)
            save_data(self)
            self._render_tasks()
            t = getattr(self, "_undo_toast", None)
            if t is not None and t.winfo_exists():
                t.destroy()
        except Exception as e:
            log.debug("undo: %s", e)

    def _toggle_done(self, task):
        """Toggle a task's done flag. Takes the task dict directly (not an
        id — see prior comment history in git/log for why id lookup was
        ruled out).

        ROOT CAUSE FOUND (2026-08-18): this was never a binding bug. The
        RENDER_TASKS diagnostic log (added to _render_tasks) proves the
        checkbox always toggles the exact task that was actually sitting
        in the clicked row at click time. What was actually happening:
        marking a task done makes it sink to the bottom immediately
        (`tasks.sort(key=lambda x: (x["done"], ...))` in _render_tasks) —
        so the moment you click, that row's task IS correctly toggled,
        but in the same instant a full re-render resorts the list and a
        DIFFERENT task slides up to occupy the screen position you just
        clicked. Look at the screen a beat later and it reads as "I
        clicked X but Y got checked" — because Y is now sitting where X
        used to be. Confirmed against a clean A/B/C test: log showed
        TASK A's id toggled, matching TASK A's logged render position at
        click time, exactly — the code was right the whole time.

        Fix: give the eye a moment to register WHICH row changed before
        it jumps. The clicked row's own checkbox flips in place
        immediately (instant feedback, no resort yet); the full
        re-sorting re-render is delayed briefly so the just-checked task
        is still visible at its original position for a moment first.

        The 400ms debounce lock is kept as a harmless backstop (log
        evidence never actually showed it firing), not because it was
        the real fix."""
        now = time.time()
        if now - getattr(self, "_last_toggle_done_at", 0) < 0.4:
            return
        self._last_toggle_done_at = now
        if task is not None:
            task["done"] = not task["done"]

            # Mirror it onto the project card row this came from, if any
            # — ticking here and ticking in NOW must have the same
            # consequences, or which control you happened to use would
            # change what the project's progress bar says.
            self._sync_project_row(task)

            def _undo(_t=task, _was=not task["done"], _s=self._sync_project_row):
                _t["done"] = _was
                _s(_t)
            self._push_undo(
                ("tick off " if task["done"] else "un-tick ")
                + '"%s"' % (task.get("text", "")[:30]), _undo)
            if task["done"]:
                self._stop_timer(task)
            # Instant in-place feedback on the exact row clicked, before
            # any resort happens — this is what lets the user actually
            # SEE which task their click landed on.
            try:
                _btn = task.get("_chk_btn")
                if _btn is not None and _btn.winfo_exists():
                    dg = self.T("DONE_GREEN")
                    t3 = self.T("TEXT3")
                    _btn.config(text="✓" if task["done"] else "○",
                                fg=dg if task["done"] else t3)
            except Exception as _e:
                log.debug("toggle_done instant feedback: %s", _e)
        save_data(self)
        if task is not None and task["done"]:
            # Hold the just-checked row in place for a beat before the
            # Zeigarnik sort sinks it to the bottom and another task
            # slides up to fill its old screen slot — see the docstring
            # above for why this pause is the actual fix, not cosmetic.
            # winfo_exists() guard: unlike _tick_id, this one-off call
            # isn't cancelled by on_close, so it can otherwise fire after
            # the window (and task_inner) are already destroyed if the
            # app is closed within the 650ms window.
            self.after(650, lambda: self.winfo_exists() and self._render_tasks())
        else:
            self._render_tasks()

    def _stop_timer(self, t):
        tid = t["id"]
        if tid in self.task_timers:
            del self.task_timers[tid]
            s = t.get("sessions", [])
            if s and s[-1].get("end") is None:
                s[-1]["end"] = time.time()

    def _toggle_task_timer(self, tid):
        task, lst = self._find_task(tid)
        if not task:
            return
        # self.work_running is the Pomodoro/FOCUS-session flag — it now
        # feeds focus_progress_secs exclusively (see _tick), so it must
        # only be driven by FOCUS-list tasks. Auto-flipping it for a
        # PLAN task would leak PLAN work-time into the FOCUS bucket and
        # break the "PLAN and FOCUS timers are independent" guarantee —
        # this is also what lets a PLAN task and a FOCUS task run their
        # timers at the same time without interfering with each other.
        _is_focus_task = lst is self.tasks_focus
        if tid in self.task_timers:
            self._stop_timer(task)
            # Only auto-pause the main Pomodoro if NO other FOCUS task
            # is still running (a still-running PLAN task must not keep
            # it "paused" state confused, since it never started it).
            if _is_focus_task and self.work_running and not any(
                    t["id"] in self.task_timers for t in self.tasks_focus):
                self.work_running = False
                btn = self._alive("work_play_btn")
                if btn is not None:
                    btn.config(text="▶", bg=self.T("GREEN"),
                               activebackground=self.T("GREEN"),
                               activeforeground="#fff")
        else:
            self.task_timers[tid] = True
            task.setdefault("sessions", []).append({"start": time.time(), "end": None})
            # Starting a FOCUS task timer also auto-starts the main
            # Pomodoro timer. A PLAN task timer never touches it.
            if _is_focus_task and not self.work_running:
                self.work_running = True
                btn = self._alive("work_play_btn")
                if btn is not None:
                    btn.config(text="⏸", bg=self.T("YELLOW"),
                               activebackground=self.T("YELLOW"),
                               activeforeground="#fff")
        self._render_tasks()

    def _reset_task_timer(self, tid):
        task, _ = self._find_task(tid)
        if not task:
            return
        self._stop_timer(task)
        # Worth undoing more than most things here: this throws away
        # recorded time, and recorded time is the one thing on a task
        # that cannot be retyped from memory.
        _prev_secs = task.get("secs", 0.0)
        _prev_sess = list(task.get("sessions", []))
        task["secs"] = 0.0
        task["sessions"] = []

        def _undo(_t=task, _s=_prev_secs, _ss=_prev_sess):
            _t["secs"] = _s
            _t["sessions"] = _ss
        self._push_undo("reset timer", _undo)
        save_data(self)
        self._render_tasks()

    def _toggle_expand(self, tid):
        self._expanded[tid] = not self._expanded.get(tid, False)
        self._render_tasks()

    def _render_tasks(self):
        """Re-render all tasks in the task canvas.

        No-ops when the task widgets aren't on screen. Since the daily
        task list now lives ONLY on the FOCUS tab (PLAN shows the
        Mindset/Discipline/Consistency review tabs instead), every
        caller that fires on a timer or a data change — _tick,
        _toggle_done, _apply_theme, the undo toast — would otherwise hit
        a destroyed self.task_inner with a TclError whenever PLAN is the
        visible tab. Checking here keeps that guard in ONE place instead
        of at ~15 call sites."""
        # BEFORE the guard, not after.
        #
        # BUG THIS FIXES: the guard below returns whenever the task list
        # isn't on screen — which, once MIT / TASK LIST / TODAY EXECUTION
        # became separate tabs, is true on two tabs out of three. With
        # this call sitting after it, ticking a task in the MIT list did
        # nothing visible: the data changed, the repaint never ran, and
        # the row only corrected itself on the next full rebuild. Both
        # halves guard themselves, so calling them first is safe.
        self._render_now()
        if self._alive("task_inner") is None or self._alive("count_lbl") is None:
            return
        # NOW and the STRIKE LIST are views over the same tasks, so they
        # are repainted from here rather than from their own call sites:
        # every action that can change a task already ends in
        # _render_tasks, and a second refresh entry point is a second
        # thing to forget.
        cb = self.T("CARD_BG")
        t = self.T("TEXT")
        t2 = self.T("TEXT2")
        t3 = self.T("TEXT3")
        green = self.T("GREEN")
        red = self.T("RED")
        yel = self.T("YELLOW")
        dg = self.T("DONE_GREEN")
        cborder = self.T("CARD_BORDER")
        rbg = self.T("RUNNING_BG")
        rgreen = self.T("RUNNING_GREEN")

        # Only the selected day's tasks are shown. The underlying list is
        # untouched — this is a view filter, not a separate collection.
        tasks = [x for x in self._task_list() if self._task_matches_day(x)]
        _key = getattr(self, "_active_task_list", "classic")
        _tomorrow = getattr(self, "_task_day", "today") == "tomorrow"
        # Committed tasks belong to the STRIKE LIST block above; showing
        # them again down here would put the same task on screen twice,
        # three inches apart, each with its own checkbox — which reads
        # as a duplication bug, not as two views.
        # "Does this list have an MIT tab somewhere?" — NOT "is the MIT
        # tab on screen right now".
        #
        # BUG THIS FIXES: this used to test whether strike_inner existed.
        # That was true while MIT and the pool were stacked on one panel,
        # but once they became separate TABS, opening TASK LIST destroyed
        # strike_inner — so the filter switched off and every committed
        # task reappeared in the pool it had been promoted out of, with
        # its old ★ and ▶ buttons back. The fact that matters is which
        # LIST this is, and that doesn't change when a tab does.
        _has_strike_ui = (getattr(self, "_active_task_list", "classic")
                          == "focus")
        if _has_strike_ui and not _tomorrow:
            tasks = [x for x in tasks if not x.get("strike")]

        for w in self.task_inner.winfo_children():
            w.destroy()
        done_n = sum(1 for t in tasks if t["done"])
        # With no tasks the label's TEXT was blanked but its accent
        # background and padding stayed, so it rendered as a stray
        # coloured square next to "+ Add". Remove the widget instead.
        if tasks:
            self.count_lbl.config(text=f"{done_n}/{len(tasks)}")
            self.count_lbl.grid()
        else:
            self.count_lbl.grid_remove()

        if not tasks:
            # Glyphs here are monochrome text characters, not colour
            # emoji. 🌙/🎯/🔍 are fixed multi-colour bitmaps that ignore
            # the theme's foreground entirely and render differently on
            # every OS — the same "hobbyist tell" already removed from
            # the tab bar and the habit categories.
            if _tomorrow:
                # Planning-mode copy: this is the Ivy Lee / shutdown-ritual
                # moment, so the prompt names the benefit rather than just
                # saying the list is empty.
                _empty_state(self.task_inner, cb, t3, "☾",
                             "Plan tomorrow, sleep better tonight",
                             "Deciding now means no deciding in the morning — "
                             "pick 3 things you'll actually do",
                             chips=["deep work ~90", "email + admin ~30",
                                    "review the day ~10"],
                             on_chip=self._quick_add_chip,
                             accent=green, chip_bg=self.T("INPUT_BG"))
            elif _key == "focus" and _has_strike_ui and self._strike_tasks():
                # This list being empty is NOT the same as having no
                # focus task — everything you took on may simply be up
                # in the STRIKE LIST. The old copy ("No active focus
                # task") flatly contradicted the running clock two
                # inches above it, which is the kind of detail that
                # makes a user stop trusting every other number on the
                # screen.
                _empty_state(self.task_inner, cb, t3, "✓",
                             "Nothing queued behind today's list",
                             "Everything you've taken on is committed above — "
                             "add here only what comes after it",
                             chips=["deep work ~45", "review inbox ~15",
                                    "quick call ~10"],
                             on_chip=self._quick_add_chip,
                             accent=green, chip_bg=self.T("INPUT_BG"))
            elif _key == "focus":
                # FOCUS's empty state names the next action rather than
                # describing the state — on this screen the user is one
                # tap from committing, so say that.
                _empty_state(self.task_inner, cb, t3, "◇",
                             "Nothing to work from yet",
                             "Add what today could contain, then + STRIKE "
                             "up to 3 of them",
                             chips=["deep work ~45", "review inbox ~15",
                                    "quick call ~10"],
                             on_chip=self._quick_add_chip,
                             accent=green, chip_bg=self.T("INPUT_BG"))
            else:
                _empty_state(self.task_inner, cb, t3,
                             "✦",
                             "A clear list is a clear mind",
                             "0 active tasks · add one — try \"deep work ~45\" "
                             "to set a 45-min time-box",
                             chips=["deep work ~45", "review inbox ~15",
                                    "quick call ~10"],
                             on_chip=self._quick_add_chip,
                             accent=green, chip_bg=self.T("INPUT_BG"))
            return

        # Zeigarnik: unfinished stay visible on top, done sink; MIT floats
        # first. Tomorrow has no MIT (that's a today-only concept) — instead
        # it groups by urgency, so every HIGH sits together above every MED
        # above every LOW, rather than interleaved in add-order.
        if _tomorrow:
            _urank = {"high": 0, "med": 1, "low": 2}
            tasks.sort(key=lambda x: (x["done"],
                                      _urank.get(x.get("urgency", "med"), 1)))
        elif _has_strike_ui:
            # MIT is hidden on this screen (the STRIKE LIST replaced it),
            # so it must not silently steer the order either — a task
            # would float to the top carrying no visible reason why, and
            # a drag that moved a row below it would look ignored.
            # Sorting on `done` alone is also what makes drag-to-reorder
            # meaningful here: sort() is stable, so within the unfinished
            # group the list's own order is what shows.
            tasks.sort(key=lambda x: bool(x["done"]))
        else:
            tasks.sort(key=lambda x: (x["done"], not x.get("mit", False)))

        # Live search filter (drag-reorder pauses while filtering) — per list,
        # so a CLASSIC search term never leaks into the FOCUS task box
        _flt = self._task_filter.get(_key, "").strip().lower()
        _view = ([t for t in tasks if _flt in t["text"].lower()]
                 if _flt else tasks)
        if _flt and not _view:
            _empty_state(self.task_inner, cb, t3, "⌕",
                         "No matching tasks",
                         "Press Esc in the search box to clear")
            return

        # self.task_timers is shared storage for BOTH lists (PLAN ids and
        # FOCUS ids can both be keys in it at once, by design — see
        # _toggle_task_timer). The "focus mode" dim effect below must
        # only react to a timer running IN THIS list; checking the raw
        # shared dict made starting a PLAN timer wash out FOCUS's list
        # too (and vice versa) even though the two timers are otherwise
        # fully independent.
        _running_in_this_list = any(x["id"] in self.task_timers for x in tasks)

        for i, task in enumerate(_view):
            tid = task["id"]

            if _tomorrow:
                # Tomorrow is a PLANNING view, not an execution one — no
                # timer/session/checkbox is relevant to a task that hasn't
                # started yet, so it gets one compact line instead of the
                # full card: a 4px urgency strip (matches the goal-card
                # left-strip language elsewhere in the app), a HIGH/MED/LOW
                # tag (text, not just color, so it isn't lost on a
                # colorblind read), the task name, and a button to promote
                # it onto today's list (which is just flipping its `day`,
                # per _task_matches_day).
                trow = tk.Frame(self.task_inner, bg=cb,
                                highlightthickness=1, highlightbackground=cborder)
                trow.grid(row=i, column=0, sticky="ew", padx=SP1, pady=SP1)
                trow.columnconfigure(2, weight=1)

                _urg = task.get("urgency", "med")
                if _urg == "high":
                    _u_bg, _u_fg = red, "#FFFFFF"
                elif _urg == "low":
                    _u_bg, _u_fg = cborder, t
                else:
                    _u_bg, _u_fg = yel, "#FFFFFF"

                tk.Frame(trow, bg=_u_bg, width=4).grid(
                    row=0, column=0, sticky="ns")

                _u_btn = tk.Button(trow, text=_urg.upper(),
                                   command=lambda x=tid: self._cycle_urgency(x),
                                   bg=_u_bg, fg=_u_fg, relief="flat",
                                   font=F_SMALL_B, bd=0, padx=7, pady=2,
                                   cursor="hand2", activebackground=_u_bg,
                                   activeforeground=_u_fg)
                _u_btn.grid(row=0, column=1, padx=(8, 8), pady=7)

                tname = tk.Label(trow, text=_title_case(task["text"]), bg=cb, fg=t,
                                 font=(_F, 13, "bold"), anchor="w",
                                 wraplength=0, justify="left")
                tname.grid(row=0, column=2, sticky="w", pady=7)
                tname.bind("<Double-Button-1>", lambda e, x=tid: self._edit_task(x))

                _send_btn = tk.Button(trow, text="→ Today",
                                      command=lambda x=tid: self._send_to_today(x),
                                      bg=cb, fg=green, relief="flat",
                                      font=F_SMALL_B, bd=0, padx=4, cursor="hand2",
                                      activebackground=cb, activeforeground=green)
                _send_btn.grid(row=0, column=3, padx=2)
                _hover(_send_btn, cb, _PANEL_COLORS[self._mode]["active_btn"],
                       green, green)

                _tdel_btn = tk.Button(trow, text="✕",
                                      command=lambda x=tid: self._delete_task(x),
                                      bg=cb, fg=t3, relief="flat", width=2,
                                      font=F_BODY_B, bd=0, cursor="hand2",
                                      activebackground=cb, activeforeground=red)
                _tdel_btn.grid(row=0, column=4, padx=(2, SP2))
                _hover(_tdel_btn, cb, _PANEL_COLORS[self._mode]["active_btn"], t3, red)
                continue

            running = tid in self.task_timers
            expanded = self._expanded.get(tid, False)
            sessions = task.get("sessions", [])
            n_sess = len(sessions)
            # MIT is switched OFF wherever the STRIKE LIST exists.
            #
            # Both answer the same question — "what is today actually
            # about" — and running them side by side produced exactly
            # the collision you'd expect: a row titled "★ Oil Order",
            # carrying a lit yellow ★ button, sitting next to a
            # "+ STRIKE" chip, with a *third* copy of the idea in the
            # NOW card above. One task, four claims about its status.
            # Three-with-a-hard-ceiling beats one-soft-star, so MIT
            # yields here and keeps its old behaviour on PLAN, where no
            # strike list exists.
            is_mit = (task.get("mit", False) and not task["done"]
                      and not _has_strike_ui)
            over_est = (task.get("est", 0) > 0 and not task["done"]
                        and task.get("secs", 0) > task["est"] * 60)
            # Focus mode: the moment ANY task's timer is running, every
            # OTHER task fades to the same quiet treatment "Done" tasks
            # already get — one active timer is the whole point of
            # starting it, so the rest of the list should stop competing
            # for attention while it runs. Reverts the instant nothing
            # is running (dim is per-render, not stored state).
            dim = _running_in_this_list and not running and not task["done"]
            # Three distinct signals, none allowed to collide:
            #   over_est -> yellow  (warning: past its time-box)
            #   MIT      -> accent, 2px (persistent "today's one priority")
            #   running  -> accent, 1px (transient "timer is going")
            # A previous fix replaced MIT's hardcoded amber with the theme
            # accent — correct — but folded it in with `running`, so the
            # standing priority and a passing state looked identical.
            # `dim` overrides MIT's border too — a faded row shouldn't
            # still carry the loud accent outline.
            border = yel if over_est else (
                green if (running or (is_mit and not dim)) else cborder)
            bw = 2 if (is_mit and not over_est and not dim) else 1
            card_bg = cb

            row = tk.Frame(self.task_inner, bg=card_bg,
                           highlightthickness=bw, highlightbackground=border)
            row.grid(row=i, column=0, sticky="ew", padx=SP1, pady=SP1)
            row.columnconfigure(0, weight=1)

            # ── Drag to reorder — bind to row body ────────────────────────────
            _drag = {"start_y": 0, "dragging": False, "ghost": None, "from_idx": i}

            def _drag_start(e, d=_drag):
                d["start_y"] = e.y_root
                d["dragging"] = False

            def _drag_motion(e, d=_drag, txt=task["text"]):
                if not d["dragging"] and abs(e.y_root - d["start_y"]) > 6:
                    d["dragging"] = True
                    g = tk.Toplevel(self)
                    g.overrideredirect(True)
                    g.attributes("-alpha", 0.75)
                    g.configure(bg=green)
                    tk.Label(g, text=f"  {_title_case(txt)}  ",
                             bg=green, fg="#fff",
                             font=F_H3, padx=8, pady=6).pack()
                    d["ghost"] = g
                if d["ghost"]:
                    d["ghost"].geometry(f"+{e.x_root+12}+{e.y_root-15}")

            def _drag_end(e, d=_drag):
                if d["ghost"]:
                    d["ghost"].destroy()
                    d["ghost"] = None
                if not d["dragging"]:
                    return
                d["dragging"] = False
                try:
                    canvas_y = (e.y_root
                                - self.task_canvas.winfo_rooty()
                                + self.task_canvas.yview()[0]
                                * self.task_inner.winfo_height())
                    children = [w for w in self.task_inner.winfo_children()
                                if isinstance(w, tk.Frame)]
                    to_idx = d["from_idx"]
                    for ci, child in enumerate(children):
                        cy = child.winfo_y()
                        ch = child.winfo_height()
                        if cy <= canvas_y <= cy + ch:
                            to_idx = ci
                            break
                        elif canvas_y < cy:
                            to_idx = max(0, ci - 1)
                            break
                    else:
                        to_idx = len(_view) - 1
                    # Clamp to the task's own done-group. _render_tasks
                    # always sorts unfinished tasks above finished ones,
                    # so a drag across that boundary would be undone by
                    # the very next render — the user would drop a row
                    # and watch it spring back, which reads as the
                    # feature being broken rather than as a rule.
                    _mine = [ci for ci, x in enumerate(_view)
                             if bool(x.get("done")) == bool(
                                 _view[d["from_idx"]].get("done"))]
                    if _mine:
                        to_idx = max(_mine[0], min(to_idx, _mine[-1]))
                    self._reorder_task(_view, d["from_idx"], to_idx)
                except Exception as _e:
                    log.debug("drag reorder: %s", _e)

            if not _flt:
                row.bind("<ButtonPress-1>", _drag_start)
                row.bind("<B1-Motion>", _drag_motion)
                row.bind("<ButtonRelease-1>", _drag_end)

            top = tk.Frame(row, bg=card_bg)
            top.grid(row=0, column=0, sticky="ew", padx=SP2,
                     pady=(6, 3) if _has_strike_ui else (8, 4))
            top.columnconfigure(0, weight=1)

            _prefix = "★ " if is_mit else ""
            # Base name color is the theme's TEXT color (not hardcoded
            # black — that would go invisible on WARROOM/MIDNIGHT's dark
            # card backgrounds). MIT keeps its original yellow highlight;
            # done AND dim (some other task is running) both fall back to
            # the same muted grey — a faded row reads as "not my focus
            # right now," same signal whether that's because it's
            # finished or just paused while something else runs.
            # 15px, not 13: the task NAME is the reason the card exists,
            # but it was rendering smaller than the timer digits beside
            # it and quieter than the button block opposite it — the two
            # things that only matter because of the name. It should win
            # its own row outright.
            # 15px everywhere EXCEPT the NEXT pool, where 13px.
            #
            # With the STRIKE LIST above it, this list is no longer the
            # main event — it is the shelf you pick from. At 15px bold it
            # was the largest text on the panel after NOW, so the visual
            # hierarchy ran backwards: the tasks you have NOT committed
            # to shouted louder than the three you had. Dropping two
            # points is enough to put them in their place without making
            # them hard to read.
            name = tk.Label(top, text=_prefix + _title_case(task["text"]), bg=card_bg,
                            fg=t3 if (task["done"] or dim)
                            else (yel if is_mit else t),
                            font=(_F, 13 if _has_strike_ui else 15, "bold"),
                            anchor="w", wraplength=0, justify="left")
            name.grid(row=0, column=0, sticky="w")
            name.bind("<Double-Button-1>", lambda e, x=tid: self._edit_task(x))
            if task.get("est", 0) and not task["done"]:
                _emins = int(task.get("secs", 0) // 60)
                _etxt = (f"! {_emins}m / ~{task['est']}m — over the time-box"
                         if over_est else f"~{task['est']}m time-box")
                tk.Label(top, text=_etxt, bg=card_bg,
                         fg=red if over_est else t3,
                         font=F_XS, anchor="w").grid(row=1, column=0, sticky="w")
            if task["done"]:
                tk.Label(top, text="  Done  ", bg=rbg, fg=dg,
                         font=F_SMALL_B, bd=0
                         ).grid(row=0, column=0, sticky="e")

            # Name gets its own clean row (above); timer/session/checkbox
            # and the action buttons share a second row, split left/right —
            # 2 rows total, not 3. A dedicated 3rd row for buttons read
            # cleaner in isolation but cost every card extra height, which
            # means more scrolling on a day with several tasks; splitting
            # this one row left/right keeps the title uncluttered without
            # that cost.
            mid = tk.Frame(row, bg=card_bg)
            mid.grid(row=1, column=0, sticky="ew", padx=SP2,
                     pady=(0, 6) if _has_strike_ui else (0, 8))
            mid.columnconfigure(0, weight=1)

            ir = tk.Frame(mid, bg=card_bg)
            ir.grid(row=0, column=0, sticky="w")
            # Elapsed time is the number the user actually checks on a task
            # row, so it gets a heavier weight and the stronger of the two
            # muted greys; the session count stays secondary but was
            # previously on t3 (the faintest tone) and read as disabled.
            # A per-task timer at the same bold/red weight as the ONE
            # "TODAY PROGRESS" timer above made the two compete for
            # attention — hard to tell at a glance which is the overall
            # daily total vs a single task's elapsed time. Only the
            # currently-RUNNING task's timer gets the loud red/bold
            # treatment now; idle task timers stay small and muted.
            _tl_main, _tl_ms = fmt_ms_parts(task["secs"])
            tl = tk.Label(ir, text=_tl_main, bg=card_bg,
                          fg=red if running else (t3 if dim else t2),
                          font=(_FM, 14, "bold") if running
                          else (_FM, 12))
            tl.pack(side="left")
            task["_lbl"] = tl
            # Hundredths, small + muted regardless of running state — same
            # treatment as the clock's seconds, so they recede instead of
            # ticking 100x/second at the same weight as the time that
            # actually matters.
            tl_ms = tk.Label(ir, text=_tl_ms, bg=card_bg, fg=t3, font=F_XS)
            tl_ms.pack(side="left", anchor="s", pady=(0, 2))
            task["_lbl_ms"] = tl_ms
            tk.Label(ir, text=f"  · {n_sess} session{'s' if n_sess != 1 else ''}",
                     bg=card_bg, fg=t2, font=F_SMALL
                     ).pack(side="left", padx=(4, 0))
            _chk_btn = tk.Button(ir, text="✓" if task["done"] else "○",
                                 bg=card_bg, fg=dg if task["done"] else t3,
                                 relief="flat", font=F_H2, highlightthickness=0,
                                 cursor="hand2", bd=0, activebackground=card_bg,
                                 command=lambda tk=task: self._toggle_done(tk))
            _chk_btn.pack(side="left", padx=(6, 0))
            # Stashed so _toggle_done can flip this exact row's glyph in
            # place the instant it's clicked, before the resort-delay
            # re-render below moves it — see _toggle_done's docstring.
            task["_chk_btn"] = _chk_btn
            _hover(_chk_btn, card_bg, _PANEL_COLORS[self._mode]["active_btn"],
                   dg if task["done"] else t3, dg)

            br = tk.Frame(mid, bg=card_bg)
            br.grid(row=0, column=1, sticky="e")
            # "+ STRIKE" — the one way a task gets committed to today
            # from this list, and now the row's PRIMARY action (▶ having
            # moved to the NOW card). Deliberately a WORD, not a star:
            # the app already spends ★ on MIT elsewhere, and two stars
            # meaning different things is how you get a control nobody
            # trusts.
            #
            # Outlined via a 1px parent frame rather than the button's
            # own highlightthickness — same Windows quirk as COMPLETE,
            # where the ring only paints while focused, leaving the chip
            # looking like loose green text sitting on the card.
            if _has_strike_ui and not task["done"] and not _tomorrow:
                _full = len(self._strike_tasks()) >= self.STRIKE_MAX
                _swrap = tk.Frame(br, bg=cborder if _full else green)
                _swrap.pack(side="left", padx=(0, 6))
                _sb = tk.Button(
                    _swrap, text="+ STRIKE",
                    bg=card_bg, fg=t3 if _full else green,
                    relief="flat", font=F_XS, bd=0,
                    cursor="" if _full else "hand2", padx=6, pady=3,
                    highlightthickness=0, activebackground=card_bg,
                    activeforeground=t3 if _full else green,
                    command=lambda x=tid: self._strike_click(x))
                _sb.pack(fill="both", expand=True, padx=1, pady=1)
                if not _full:
                    _hover(_sb, card_bg,
                           _PANEL_COLORS[self._mode]["active_btn"],
                           green, green)
            if not task["done"]:
                if not _has_strike_ui:
                    # MIT is the odd one out in this button row: ▶/↺/✕ are
                    # pure ACTIONS with no meaning at rest, so muting them
                    # until hover was correct. The star is also a STATUS —
                    # "is this today's one most important task" is worth
                    # knowing at a glance, so its unset (☆) state uses t2
                    # (readable-but-secondary), not t3 (the near-invisible
                    # tone reserved for hover-only buttons). The lit (★)
                    # state still fades under focus-mode dim, same as
                    # everything else on a row that isn't the running task.
                    _mit_b = tk.Button(br, text="★" if is_mit else "☆",
                                       command=lambda x=tid: self._set_mit(x),
                                       bg=card_bg,
                                       fg=yel if (is_mit and not dim) else t2,
                                       relief="flat", width=2, font=F_BODY_B,
                                       bd=0, cursor="hand2",
                                       activebackground=card_bg,
                                       activeforeground=yel)
                    _mit_b.pack(side="left", padx=(0, 2))
                    _hover(_mit_b, card_bg, card_bg,
                           yel if (is_mit and not dim) else t2, yel)
                # ▶ is also withheld wherever the STRIKE LIST exists —
                # and this one is a correctness fix, not just tidying.
                # _toggle_task_timer knows nothing about NOW or about
                # project clocks, so a ▶ pressed down here would run a
                # task's timer while the NOW card above still showed
                # "▶ START", and the work would never reach the project
                # it belongs to. Committing is how you start: + STRIKE,
                # then START. One clock, one door to it.
                if not _has_strike_ui:
                    _play_btn = tk.Button(
                        br, text="⏸" if running else "▶",
                        command=lambda x=tid: self._toggle_task_timer(x),
                        bg=yel if running else green, fg="#FFFFFF",
                        relief="flat", width=2, font=F_BODY_B,
                        cursor="hand2", bd=0,
                        activebackground=self.T("GREEN2"),
                        activeforeground="#fff")
                    _play_btn.pack(side="left", padx=1)
                    _hover(_play_btn, yel if running else green,
                           self.T("GREEN2"), "#fff", "#fff")

                # Reset is a CORRECTION, not an action you're reaching for
                # — it used to be a filled yellow block, the same visual
                # weight as ▶, so the row read as two equally-important
                # buttons. Now it's quiet by default and only picks up its
                # yellow on hover, when you're actually aiming at it.
                _reset_btn = tk.Button(br, text="↺",
                                       command=lambda x=tid: self._reset_task_timer(x),
                                       bg=card_bg, fg=t3, relief="flat", width=2,
                                       font=F_BODY_B, cursor="hand2", bd=0,
                                       highlightthickness=0,
                                       activebackground=yel, activeforeground="#fff")
                _reset_btn.pack(side="left", padx=1)
                _hover(_reset_btn, card_bg, yel, t3, "#fff")
            # Delete was the single most saturated element in the whole
            # row — a solid red block louder than the task's own name,
            # for the one action that is both rarely wanted and
            # irreversible. Saturation should track intent, not danger:
            # it stays muted until you hover it, and only then goes red.
            del_btn = tk.Button(br, text="✕",
                                command=lambda x=tid: self._delete_task(x),
                                bg=card_bg, fg=t3, relief="flat", width=2,
                                font=F_BODY_B, cursor="hand2", bd=0,
                                highlightthickness=0,
                                activebackground=red, activeforeground="#fff"
                                )
            del_btn.pack(side="left", padx=1)
            _hover(del_btn, card_bg, red, t3, "#fff")

            # Expand is pure navigation — the quietest thing in the row.
            # It sat on a filled `cborder` chip, which made it read as a
            # button of the same class as ▶/↺/✕; now it's bare on the
            # card like the ☆ next to it.
            exp_btn = tk.Button(br, text="∧" if expanded else "∨",
                                command=lambda x=tid: self._toggle_expand(x),
                                bg=card_bg, fg=t3, relief="flat", width=2,
                                font=F_BODY, cursor="hand2", bd=0,
                                highlightthickness=0,
                                activebackground=card_bg, activeforeground=t
                                )
            exp_btn.pack(side="left", padx=1)
            _hover(exp_btn, card_bg, card_bg, t3, t)

            if expanded and sessions:
                hist = tk.Frame(row, bg=self.T("GREEN_LIGHT"),
                                highlightthickness=1, highlightbackground=cborder)
                hist.grid(row=2, column=0, sticky="ew", padx=SP2, pady=(0, 8))
                hist.columnconfigure(0, weight=1)
                tk.Label(hist, text="  ⏱  Session History",
                         bg=self.T("GREEN_LIGHT"), fg=t,
                         font=F_XS, anchor="w"
                         ).grid(row=0, column=0, sticky="ew", padx=SP2, pady=(5, 3))
                for j, sess in enumerate(sessions):
                    sr = tk.Frame(hist, bg=cb, highlightthickness=1,
                                  highlightbackground=cborder)
                    sr.grid(row=j + 1, column=0, sticky="ew", padx=SP2, pady=SP1)
                    sr.columnconfigure(0, weight=1)
                    tk.Label(sr, text=f"  ▶  Start: {fmt_datetime(sess['start'])}",
                             bg=cb, fg=self.T("TEXT2"), font=F_XS, anchor="w"
                             ).grid(row=0, column=0, sticky="w", padx=SP1, pady=SP1)
                    if sess.get("end") is None:
                        tk.Label(sr, text="  Active  ", bg=rbg, fg=rgreen,
                                 font=F_XS, bd=0
                                 ).grid(row=0, column=1, padx=(0, 6), pady=SP1)
                    else:
                        dur = int(sess["end"] - sess["start"])
                        tk.Label(sr,
                                 text=f"  ■  End: {fmt_datetime(sess['end'])}  ({fmt(dur)})",
                                 bg=cb, fg=t3, font=F_XS, anchor="w"
                                 ).grid(row=1, column=0, columnspan=2,
                                        sticky="w", padx=SP1, pady=(0, 3))
                tk.Frame(hist, bg=self.T("GREEN_LIGHT"), height=3
                         ).grid(row=len(sessions) + 1, column=0)

    def _edit_task(self, tid):
        task, _ = self._find_task(tid)
        if not task:
            return
        cb = self.T("CARD_BG")
        bg = self.T("BG")
        t = self.T("TEXT")
        green = self.T("GREEN")
        win = tk.Toplevel(self)
        win.title("Edit Task")
        win.geometry("320x150+200+300")
        win.configure(bg=bg)
        win.resizable(False, False)
        win.attributes("-topmost", True)
        tk.Label(win, text="Edit:", bg=bg, fg=t,
                 font=F_SMALL).pack(anchor="w", padx=SP3, pady=(12, 2))
        e = tk.Entry(win, bg=cb, fg=t, font=F_BODY,
                     relief="flat", highlightthickness=1,
                     highlightbackground=green, insertbackground=t)
        _pre = task["text"] + (f" ~{task['est']}" if task.get("est") else "")
        e.pack(fill="x", padx=SP3)
        e.insert(0, _pre)
        e.focus()
        tk.Label(win, text="Tip: add ~30 at the end = 30-min time-box",
                 bg=bg, fg=self.T("TEXT3"), font=F_XS).pack(anchor="w", padx=SP3)

        def save(ev=None):
            n = e.get().strip()
            if n:
                _old_text = task.get("text", "")
                _old_est = task.get("est", 0)
                import re as _re
                m = _re.search(r"~\s*(\d+)\s*m?$", n)
                if m:
                    task["est"] = int(m.group(1))
                    task.pop("_over", None)   # re-arm Parkinson alert
                    n = n[:m.start()].strip() or n
                else:
                    task["est"] = 0
                task["text"] = n

                def _undo(_t=task, _ot=_old_text, _oe=_old_est):
                    _t["text"] = _ot
                    _t["est"] = _oe
                self._push_undo("edit task text", _undo)
            save_data(self)
            self._render_tasks()
            win.destroy()
        e.bind("<Return>", save)
        tk.Button(win, text="Save", command=save, bg=green, fg="#FFFFFF",
                  relief="flat", font=F_SMALL_B, cursor="hand2"
                  ).pack(pady=SP2)

    # ── Tick ──────────────────────────────────────────────────────────────────
    def _tick(self):
        """Main 50ms heartbeat — updates clock, timer, progress.

        Timers advance by REAL elapsed time (monotonic), not an assumed
        50ms — no more drift when the event loop lags."""
        _now_m = time.monotonic()
        _dt_s = _now_m - getattr(self, "_last_tick_m", _now_m)
        self._last_tick_m = _now_m
        _dt_s = max(0.0, min(_dt_s, 1.0))   # clamp: sleep/suspend safe
        # Clock (also updates the date/day-number labels internally)
        try:
            self._update_clock()
        except Exception:
            pass
        # Daily progress bar reset — fresh start every new day (app was
        # already running when midnight passed). See _rollover_day's
        # docstring for why this and __init__'s cold-start check now
        # share one definition instead of two that could disagree.
        if self.progress_date != str(date.today()):
            self._rollover_day()
            try:
                self._update_progress_bar()
            except Exception as _e:
                log.debug("pb reset: %s", _e)
            try:
                self._render_tasks()
            except Exception as _e:
                log.debug("render reset: %s", _e)
            self.after(2000, self._maybe_mit_prompt)

        # Pomodoro engine (FOCUS view) — counts down in real time
        if self._pomo.get("running"):
            self._pomo["remain"] -= _dt_s
            if self._pomo["remain"] <= 0:
                try:
                    self._pomo_finish()
                except Exception as _e:
                    log.debug("pomo finish: %s", _e)
        try:
            self._update_focus_view()
            self._update_exec_clock()
        except Exception:
            pass
        # Separate call, not folded into the above: the scope cards live
        # on the PLAN screen now, so they must tick even when the FOCUS
        # view isn't built (which is exactly when _update_focus_view
        # returns early).
        try:
            self._update_scope_stats()
        except Exception:
            pass

        # Work timer — driven exclusively by the Pomodoro engine on the
        # FOCUS screen (_pomo_drive sets it when a focus session starts
        # without a specific task picked), so its seconds count toward
        # focus_progress_secs, not the PLAN bucket. The standalone
        # display/play button was removed, so there's no widget left to
        # update here.
        if self.work_running:
            self.work_secs += _dt_s

        # Task timers — both lists can have live timers simultaneously.
        # PLAN (self.tasks) and FOCUS (self.tasks_focus) are counted
        # separately now, each feeding its own progress accumulator
        # below, so the two screens can track independent daily targets
        # instead of sharing one combined number.
        plan_running_secs = 0.0
        focus_running_secs = 0.0
        for _is_focus_list, t in (
                [(False, t) for t in self.tasks] +
                [(True, t) for t in self.tasks_focus]):
            if t["id"] in self.task_timers and not t["done"]:
                t["secs"] = t.get("secs", 0.0) + _dt_s
                if _is_focus_list:
                    focus_running_secs += _dt_s
                else:
                    plan_running_secs += _dt_s
                lbl = t.get("_lbl")
                lbl_ms = t.get("_lbl_ms")
                if lbl:
                    try:
                        if lbl.winfo_exists():
                            _t_main, _t_ms = fmt_ms_parts(t["secs"])
                            lbl.config(text=_t_main)
                            if lbl_ms and lbl_ms.winfo_exists():
                                lbl_ms.config(text=_t_ms)
                    except Exception as _e:
                        log.debug("task_lbl: %s", _e)
                # Parkinson's Law: task expanded past its time-box → alert once
                if (t.get("est", 0) and not t.get("_over")
                        and t["secs"] > t["est"] * 60):
                    t["_over"] = True
                    try:
                        self._render_tasks()
                    except Exception as _e:
                        log.debug("parkinson: %s", _e)

        # ── PLAN progress — driven by the PROJECT timers ─────────────────
        # progress_secs is no longer its own accumulator; it is DERIVED
        # from the sum of today's per-project seconds. That matters
        # because the bar's job changed: it now answers "did I put time
        # into each project today", which only a per-project clock can
        # measure. Deriving rather than accumulating also means the
        # number can't drift away from the per-project logs the
        # segmented bar and the Consistency tab both read.
        #
        # Task timers deliberately do NOT feed this any more — they feed
        # focus_progress_secs below. Clean split: PLAN answers "did I
        # touch every project", FOCUS answers "did I do deep sessions".
        _proj_key = getattr(self, "_proj_running", None)
        if _proj_key:
            self._proj_add_secs(_proj_key, _dt_s)
            _sess = getattr(self, "_proj_session", None)
            if _sess and _sess.get("key") == _proj_key:
                _sess["banked"] = float(_sess.get("banked", 0.0)) + _dt_s
            # ── Idle auto-stop ───────────────────────────────────────
            # A timer you forgot to stop is worse than one you forgot to
            # start: it invents work that never happened, and every
            # number downstream (day total, streak, trend, "N/6 projects
            # today") inherits the lie. Checked once a second rather
            # than every 50ms — GetLastInputInfo is cheap but not free.
            self._idle_ctr = getattr(self, "_idle_ctr", 0) + 1
            if self._idle_ctr >= 20:
                self._idle_ctr = 0
                _idle = self._idle_seconds()
                if _idle >= self._idle_limit_secs():
                    self._close_project_session(_proj_key, time.time(),
                                                idle_secs=_idle)
                    self._proj_running = None
                    save_data(self)
                    try:
                        self._refresh_project_time_label(_proj_key)
                        self._update_progress_bar()
                    except Exception as _e:
                        log.debug("idle stop repaint: %s", _e)
            try:
                self._refresh_project_time_label(_proj_key)
            except Exception as _e:
                log.debug("proj lbl tick: %s", _e)
            self.progress_secs = self._proj_total_today()
        else:
            # Nothing is running, so the total cannot be changing — but
            # resync roughly once a second anyway so a day rollover or an
            # edit made elsewhere can't leave a stale figure on screen.
            # _tick fires every 50ms; rebuilding six project-config dicts
            # twenty times a second just to re-add the same numbers was
            # pure waste.
            self._psync_ctr = getattr(self, "_psync_ctr", 0) + 1
            if self._psync_ctr >= 20:
                self._psync_ctr = 0
                self.progress_secs = self._proj_total_today()
        _any_running = (bool(_proj_key) or focus_running_secs > 0
                        or self.work_running)

        # FOCUS progress — FOCUS-list task timers AND the Pomodoro work
        # timer both feed this separate bucket, against its own goal.
        if self.work_running or focus_running_secs > 0:
            if self.focus_progress_secs < self._goal_secs_focus():
                self.focus_progress_secs += _dt_s
                self.focus_progress_secs = min(
                    self.focus_progress_secs, self._goal_secs_focus())

        if _any_running:
            try:
                self._update_progress_bar()
            except Exception as _e:
                log.debug("pb update: %s", _e)
        # Auto-save every 15s
        self._save_ctr += 1
        if self._save_ctr >= 300:
            self._save_ctr = 0
            self._record_today()
            save_data(self)
        # Refresh project task day counters every 60s
        self._day_ctr = getattr(self, "_day_ctr", 0) + 1
        if self._day_ctr >= 1200:   # every 60s (1200 * 50ms)
            self._day_ctr = 0
            self._refresh_project_day_labels()
            self._update_insights()
        self._tick_id = self.after(50, self._tick)

    def _refresh_project_day_labels(self):
        """Update DAY N labels on all project task rows."""
        try:
            for widget in self.winfo_children():
                self._refresh_day_labels_in(widget)
        except Exception:
            pass

    def _refresh_day_labels_in(self, parent):
        try:
            for child in parent.winfo_children():
                if hasattr(child, "_is_day_lbl") and child._is_day_lbl:
                    added = getattr(child, "_added_date", str(date.today()))
                    diff = (date.today() - date.fromisoformat(added)).days + 1
                    child.config(text=f"DAY {diff}")
                self._refresh_day_labels_in(child)
        except Exception:
            pass

    # ── Project Detail / Analysis Window ─────────────────────────────────────
    def _open_detail_window(self, key, cfg):
        win_attr = f"_detail_win_{key}"
        existing = getattr(self, win_attr, None)
        if existing:
            try:
                if existing.winfo_exists():
                    self._bring_window_front(existing)
                    return
            except Exception:
                pass

        night = self._mode in ("warroom", "journey")
        proj_accent = cfg["accent"]
        vd = self.vision_data.get(key, {})
        proj_title = vd.get("title", "") or cfg["label"]

        # ── Notion-style design tokens ────────────────────────────────────────
        if night:
            PAGE_BG = "#111110"
            CARD_BG = "#1A1915"
            BORDER = "#2F2F2C"
            HDR_TEXT = "#E8E8E4"
            BODY_TEXT = "#C8C8C4"
            TOPBAR = "#0D0D0C"
            MUTED = "#555550"
        else:
            PAGE_BG = "#F7F7F5"
            CARD_BG = "#FFFFFF"
            BORDER = "#E5E5E5"
            # Pure black, not Notion's #37352F near-black. On the three
            # light themes this is the maximum-contrast choice and it is
            # what was asked for. NOT applied to the dark branch above —
            # black on a #1A1915 card is invisible, so WAR ROOM keeps its
            # light-on-dark pair. "All text black" and "all text readable"
            # are the same instruction; on a dark surface they diverge.
            HDR_TEXT = "#000000"
            BODY_TEXT = "#000000"
            TOPBAR = "#FFFFFF"
            MUTED = "#9B9B97"

        # Header tint colour by MEANING, not by grid position — kept from
        # the old 15-box version, trimmed to the 5 groups this page still
        # needs.
        _G_IDEA = "#4C6EF5"      # blue    — what the thing even is
        _G_UPSIDE = "#0CA678"    # teal    — opportunity/reality side
        _G_MONEY = "#F08C00"     # orange  — money in and money out
        _G_DECIDE = "#7048E8"    # indigo  — the judgement call
        _G_DO = "#2F9E44"        # green   — what happens next

        # Redesigned from the original 15-box Business Model Canvas down
        # to 5 — the old layout answered "what are all the parts of a
        # business" (an information-architecture question); this answers
        # "should I do this, and what's next" (a decision question),
        # which is what a project owner actually opens this page to find
        # out. Sub-topics that used to be their own separate boxes
        # (Customer Segments, Channels, Key Resources, etc.) are now
        # just guidance text under a single box's header — one place to
        # write about "the opportunity", not nine boxes to fill in to
        # avoid a blank one looking incomplete.
        #
        # New field keys (ba_idea / ba_analysis / ...) rather than
        # reusing the old ba_box_N ones on purpose: the old 15 fields
        # don't map cleanly 1:1 onto 5 new ones (e.g. old box 2 was both
        # "decision" AND "analysis" mixed together), so guessing a merge
        # risks silently scrambling someone's existing notes. The old
        # ba_box_* values stay in vision_data untouched (still exported,
        # never deleted) — just not shown on this redesigned page.
        # ── Sections, each with fields inside ────────────────────────────────
        # Five sections was the right call; five big empty text areas was
        # not. "Fewer boxes" was meant to stop the page asking fifteen
        # separate questions — it was never meant to replace them with
        # five blank walls, which is worse: a large empty rectangle
        # labelled ANALYSIS tells you nothing about what analysis means
        # and is intimidating to start.
        #
        # So: few SECTIONS, structured FIELDS inside each. The fields are
        # compact labelled rows within one card — not a card per field,
        # which is what made the original fifteen-box version heavy.
        #
        # (section_key, title, accent, [(field_key, label, height_lines)])
        SECTIONS = [
            ("idea", "IDEA", _G_IDEA, [
                ("ba_idea_business", "BUSINESS IDEA", 2),
                ("ba_idea_problem", "PROBLEM IT SOLVES", 2),
                ("ba_idea_customer", "TARGET CUSTOMER", 2),
                ("ba_idea_goal", "GOAL", 2),
            ]),
            ("analysis", "ANALYSIS", _G_UPSIDE, [
                ("ba_an_market", "MARKET OPPORTUNITY", 2),
                ("ba_an_competition", "COMPETITION", 2),
                ("ba_an_strength", "STRENGTH", 2),
                ("ba_an_risk", "WEAKNESS / RISK", 2),
            ]),
            ("financial", "FINANCIAL REALITY", _G_MONEY, [
                ("ba_fin_investment", "INVESTMENT", 2),
                ("ba_fin_cost", "COST", 2),
                ("ba_fin_revenue", "REVENUE", 2),
                ("ba_fin_profit", "PROFIT", 2),
            ]),
            ("decision", "DECISION", _G_DECIDE, [
                ("ba_decision_why", "WHY THIS DECISION?", 3),
            ]),
            ("next", "NEXT ACTION", _G_DO, [
                ("ba_next_action", "NEXT MOST IMPORTANT ACTION", 2),
            ]),
        ]

        self.vision_data.setdefault(key, {})
        vd = self.vision_data[key]
        for _sk, _st, _sa, _flds in SECTIONS:
            for _fk, _fl, _fh in _flds:
                vd.setdefault(_fk, "")
        vd.setdefault("ba_decision_status", "")
        vd.setdefault("ba_next_priority", "")
        vd.setdefault("ba_next_deadline", "")

        # ── Carry forward the single-box text ────────────────────────────────
        # The previous version stored one blob per section. Those blobs
        # move into the FIRST field of their section, where the text
        # still makes sense, rather than being guessed apart across the
        # new fields — a wrong split would scramble sentences, and there
        # is no way to undo that. The originals are left in vd untouched.
        if not vd.get("ba_fields_migrated"):
            for _old, _new in (("ba_idea", "ba_idea_business"),
                               ("ba_analysis", "ba_an_market"),
                               ("ba_financial", "ba_fin_investment"),
                               ("ba_decision", "ba_decision_why")):
                _t = (vd.get(_old) or "").strip()
                if _t and not (vd.get(_new) or "").strip():
                    vd[_new] = _t
            vd["ba_fields_migrated"] = True

        # Every size on this page is 2pt above the app's shared scale —
        # it is a read-and-write analysis page, not a compact panel, so
        # the box titles and the text you type in them get room to
        # breathe. Local constants: F_BODY / F_H3 are used by every other
        # panel and must not move.
        FONT_TITLE = (_F, 20, "bold")
        FONT_HDR = (_F, 12)
        FONT_BODY = (_F, 12)
        FONT_META = (_F, 11)
        # Apply semibold weight via font object if available
        import tkinter.font as _tkfont
        try:
            _fb = _tkfont.Font(family="Segoe UI Variable", size=13,
                               weight="bold")
            FONT_BODY = _fb
        except Exception:
            FONT_BODY = (_F, 13, "bold")

        def _hex_tint(hex_col, factor=0.12):
            """Blend color toward white for soft tinted header bg."""
            r = int(hex_col[1:3], 16)
            g = int(hex_col[3:5], 16)
            b = int(hex_col[5:7], 16)
            r = int(r + (255 - r) * (1 - factor))
            g = int(g + (255 - g) * (1 - factor))
            b = int(b + (255 - b) * (1 - factor))
            return f"#{r:02X}{g:02X}{b:02X}"

        def _hex_tint_dark(hex_col, factor=0.15):
            """Dark mode: blend color toward dark bg."""
            r = int(hex_col[1:3], 16)
            g = int(hex_col[3:5], 16)
            b = int(hex_col[5:7], 16)
            r = int(r * factor)
            g = int(g * factor)
            b = int(b * factor)
            return f"#{max(r, 26):02X}{max(g, 26):02X}{max(b, 26):02X}"

        def _hex_blend(c1, c2, t):
            """Blend c1 -> c2 by t (0 = c1, 1 = c2)."""
            r1, g1, b1 = int(c1[1:3], 16), int(c1[3:5], 16), int(c1[5:7], 16)
            r2, g2, b2 = int(c2[1:3], 16), int(c2[3:5], 16), int(c2[5:7], 16)
            r = int(r1 + (r2 - r1) * t)
            g = int(g1 + (g2 - g1) * t)
            b = int(b1 + (b2 - b1) * t)
            return f"#{r:02X}{g:02X}{b:02X}"

        # ── Window ────────────────────────────────────────────────────────────
        win = tk.Toplevel(self)
        setattr(self, win_attr, win)
        win.title(f"{proj_title}  —  Business Analysis")
        win.configure(bg=PAGE_BG)
        self._setup_window(win, key, "1440x900+10+10")
        self._auto_timer_on_open(key)

        # ── Top bar — Notion style: white bar, large title ────────────────────
        top = tk.Frame(win, bg=TOPBAR,
                       highlightthickness=1,
                       highlightbackground=BORDER)
        top.pack(fill="x")
        tk.Frame(top, bg=proj_accent, width=4).pack(side="left", fill="y")
        tk.Label(top,
                 text=f"  {proj_title}",
                 bg=TOPBAR, fg=HDR_TEXT,
                 font=FONT_TITLE,
                 pady=SP3).pack(side="left", padx=(10, 0))
        tk.Label(top,
                 text="  —  Business Analysis",
                 bg=TOPBAR, fg=MUTED,
                 font=FONT_HDR
                 ).pack(side="left")
        save_lbl = tk.Label(top, text="✓  Saved",
                            bg=TOPBAR, fg="#2F9E44",
                            font=FONT_META)
        save_lbl.pack(side="right", padx=SP5)

        def _saved():
            try:
                save_lbl.config(text="✓  Saved", fg="#2F9E44")
            except Exception as _e:
                log.debug("suppressed: %s", _e)

        # ── Attach file — same "launch, don't embed" link-to-a-Word/Excel
        # doc as the Product Journey page. vision_data's save_data()/
        # clean_vision() only persists a fixed field whitelist, so any
        # new key added to vd here would be silently dropped on save —
        # the path is stored in self._habit_data instead (same reason
        # Journey state lives there too), keyed per-project.
        _ba_attach_key = f"__ba_attach_{key}"

        def _ba_attach_open(e=None):
            path = self._habit_data.get(_ba_attach_key, "")
            if not path or not os.path.exists(path):
                return
            try:
                if sys.platform.startswith("win"):
                    os.startfile(path)
                elif sys.platform == "darwin":
                    subprocess.Popen(["open", path])
                else:
                    subprocess.Popen(["xdg-open", path])
            except Exception as _e:
                log.debug("open ba attach_file: %s", _e)

        def _ba_attach_pick():
            path = filedialog.askopenfilename(
                parent=win,
                title="Attach Word / Excel file",
                filetypes=[("Word & Excel",
                            "*.docx *.doc *.xlsx *.xls *.xlsm *.csv"),
                           ("Word documents", "*.docx *.doc"),
                           ("Excel spreadsheets", "*.xlsx *.xls *.xlsm"),
                           ("All files", "*.*")])
            win.lift()
            win.focus_force()
            if not path:
                return
            self._habit_data[_ba_attach_key] = path
            save_data(self)
            _render_ba_attach()

        def _ba_attach_clear(e=None):
            self._habit_data[_ba_attach_key] = ""
            save_data(self)
            _render_ba_attach()
            return "break"

        attach_wrap = tk.Frame(top, bg=TOPBAR)
        attach_wrap.pack(side="right", padx=(0, 4))

        def _render_ba_attach():
            for w in attach_wrap.winfo_children():
                w.destroy()
            path = self._habit_data.get(_ba_attach_key, "")
            if path and os.path.exists(path):
                fname = os.path.basename(path)
                if len(fname) > 24:
                    fname = fname[:21] + "…"
                btn = tk.Label(attach_wrap, text="+  " + fname, bg=TOPBAR,
                               fg=MUTED, font=FONT_META, cursor="hand2",
                               padx=6, pady=2)
                btn.pack(side="left")
                btn.bind("<Button-1>", _ba_attach_open)
                _hover(btn, TOPBAR, TOPBAR, MUTED, HDR_TEXT)
                _add_tooltip(btn, "Click to open · double-click to detach")
                btn.bind("<Double-Button-1>", _ba_attach_clear)
            else:
                btn = tk.Label(attach_wrap, text="+  Attach Word/Excel",
                               bg=TOPBAR, fg=MUTED, font=FONT_META,
                               cursor="hand2", padx=6, pady=2)
                btn.pack(side="left")
                btn.bind("<Button-1>", lambda e: _ba_attach_pick())
                _hover(btn, TOPBAR, TOPBAR, MUTED, HDR_TEXT)
                _add_tooltip(btn, "Link a supporting Word/Excel file")

        _render_ba_attach()

        # Two visual tiers so all 15 boxes stop competing equally: the
        # 11 analysis boxes (SWOT + the decision box + the full
        # Business Model Canvas) read as the page's real content and
        # get a bolder/larger header + thicker accent bar; the 4
        # quick-capture utility boxes (Task, Next Task, Notes) stay
        # smaller/lighter so they read as scratch space, not analysis.
        FONT_HDR_IMPORTANT = (_F, 13, "bold")
        FONT_HDR_UTILITY = (_F, 11)

        # ── Notion-style card builder ─────────────────────────────────────────
        # DEAD — kept only so the diff stays readable; the page now uses
        # _section_card + _field further down. Left in place rather than
        # deleted because it is unreferenced and removing 140 lines by
        # hand, with no way to run the file here, is the riskier move.
        def _box_unused(parent, row, col, field_key, title, accent,
                 important=True, padx=(8, 8), pady=(8, 8),
                 colspan=1, subtitle=None, extra=None):
            # colspan: how many grid columns this card spans (added for
            # the 5-box redesign — IDEA/DECISION/NEXT ACTION run the
            # full width, ANALYSIS/FINANCIAL REALITY sit side by side).
            # subtitle: a small grey hint line under the header naming
            # the sub-topics this box covers, so one free-text box can
            # replace several of the old fixed boxes without feeling
            # like a mystery blank field.
            # extra: optional callback(card_frame) invoked right after
            # the header, before the text body — used by DECISION to
            # insert its GO/VALIDATE/PIVOT/NO-GO selector row.

            has_content = bool(vd.get(field_key, "").strip())
            bar_w = 5 if important else 3
            hdr_font = FONT_HDR_IMPORTANT if important else FONT_HDR_UTILITY

            def _tint_for(filled):
                factor_light = 0.14 if filled else 0.05
                factor_dark = 0.17 if filled else 0.08
                return (_hex_tint_dark(accent, factor_dark) if night
                        else _hex_tint(accent, factor_light))

            def _bar_col_for(filled):
                return accent if filled else _hex_blend(accent, BORDER, 0.6)

            HDR_TINT = _tint_for(has_content)

            # Outer card frame — simulates border-radius + shadow via nested frames
            # tkinter has no border-radius, so we use highlightthickness + bg trick
            outer = tk.Frame(parent, bg=BORDER)
            outer.grid(row=row, column=col, columnspan=colspan, sticky="nsew",
                       padx=padx, pady=pady)
            outer.columnconfigure(0, weight=1)
            outer.rowconfigure(0, weight=1)

            # Card inner
            card = tk.Frame(outer, bg=CARD_BG)
            card.grid(row=0, column=0, sticky="nsew", padx=1, pady=1)
            card.columnconfigure(0, weight=1)
            card.rowconfigure(2, weight=1)

            # ── Header row ────────────────────────────────────────────────────
            hdr_outer = tk.Frame(card, bg=HDR_TINT)
            hdr_outer.grid(row=0, column=0, sticky="ew")
            hdr_outer.columnconfigure(1, weight=1)

            # Left accent bar — thicker on the important tier
            accent_bar = tk.Frame(
                hdr_outer, bg=_bar_col_for(has_content), width=bar_w)
            accent_bar.grid(row=0, column=0, sticky="ns",
                            padx=(0, 0), pady=0)

            # Editable title entry — no border, sits on tinted bg
            saved_t = vd.get(field_key + "_title", "") or title
            hvar = tk.StringVar(value=saved_t)
            hent = tk.Entry(hdr_outer,
                            textvariable=hvar,
                            bg=HDR_TINT,
                            fg=HDR_TEXT,
                            insertbackground=HDR_TEXT,
                            relief="flat", bd=0,
                            font=hdr_font,
                            highlightthickness=0)
            hent.grid(row=0, column=1, sticky="ew",
                      padx=(10, 8), pady=SP2)

            if subtitle:
                sub_lbl = tk.Label(hdr_outer, text=subtitle,
                                    bg=HDR_TINT, fg=MUTED,
                                    font=FONT_META, anchor="w",
                                    justify="left", wraplength=640)
                sub_lbl.grid(row=1, column=1, sticky="ew",
                             padx=(10, 8), pady=(0, 4))
            else:
                sub_lbl = None

            def _refresh_emphasis(fk=field_key):
                filled = bool(vd.get(fk, "").strip())
                tint = _tint_for(filled)
                hdr_outer.config(bg=tint)
                hent.config(bg=tint)
                if sub_lbl is not None:
                    sub_lbl.config(bg=tint)
                accent_bar.config(bg=_bar_col_for(filled))

            def _hs(e=None, fk=field_key + "_title", var=hvar, dft=title):
                v = var.get().strip() or dft
                var.set(v)
                self.vision_data[key][fk] = v
                save_data(self)
                _saved()
            hent.bind("<FocusOut>", _hs)
            hent.bind("<Return>", _hs)

            # Header bottom border
            tk.Frame(card, bg=BORDER, height=1).grid(
                row=0, column=0, sticky="ews")

            # Optional extra row between header and body — used by the
            # DECISION box for its GO/VALIDATE/PIVOT/NO-GO selector.
            if extra is not None:
                extra_frame = tk.Frame(card, bg=CARD_BG)
                extra_frame.grid(row=1, column=0, sticky="ew")
                extra(extra_frame)

            # ── Body: dotted lines effect via Canvas ──────────────────────────
            body = tk.Frame(card, bg=CARD_BG)
            body.grid(row=2, column=0, sticky="nsew")
            body.columnconfigure(0, weight=1)
            body.rowconfigure(0, weight=1)

            # Text area with line spacing to simulate dotted lines
            ta = tk.Text(body,
                         bg=_PANEL_COLORS[self._mode]["note_bg"],
                         fg=BODY_TEXT,
                         font=FONT_BODY,
                         relief="flat", bd=0,
                         insertbackground=BODY_TEXT,
                         highlightthickness=0,
                         spacing1=3, spacing2=0, spacing3=3,
                         wrap="word",
                         padx=SP3, pady=SP2)
            ta.insert("1.0", vd.get(field_key, ""))
            ta.grid(row=0, column=0, sticky="nsew", padx=(4, 0))

            # Autosave — all variables captured explicitly via default args
            def _key(e, _w=ta, _fk=field_key, _vd=self.vision_data, _k=key):
                _vd[_k][_fk] = _w.get("1.0", "end-1c")
                save_data(self)
                _saved()

            def _fout(e, _w=ta, _fk=field_key, _vd=self.vision_data, _k=key,
                      _o=outer):
                _o.config(bg=BORDER)
                _vd[_k][_fk] = _w.get("1.0", "end-1c")
                _refresh_emphasis()
                save_data(self)
                _saved()

            def _fin(e, _o=outer, _ho=hdr_outer, _he=hent, _ac=accent, _ht=HDR_TINT):
                _o.config(bg=_ac)
                tint = _hex_tint(_ac, 0.20) if not night else _hex_tint_dark(_ac, 0.22)
                _ho.config(bg=tint)
                _he.config(bg=tint)

            ta.bind("<KeyRelease>", _key)
            ta.bind("<FocusOut>", _fout)
            ta.bind("<FocusIn>", _fin)
            hent.bind("<FocusIn>", _fin)
            hent.bind("<FocusOut>", lambda e, _f=_fout, _h=_hs: (_f(e), _h(e)))

            # Subtle hover on outer
            def _hover_in(e): outer.config(bg=accent)
            def _hover_out(e): outer.config(bg=BORDER)
            for w in [card, hdr_outer, body]:
                w.bind("<Enter>", _hover_in)
                w.bind("<Leave>", _hover_out)

        # ── Main grid: 4 rows × 2 cols — decision-first layout ───────────────
        # Row 0: IDEA (full width)
        # Row 1: ANALYSIS | FINANCIAL REALITY (side by side)
        # Row 2: DECISION (full width, with GO/VALIDATE/PIVOT/NO-GO selector)
        # Row 3: NEXT ACTION (full width)
        main = tk.Frame(win, bg=PAGE_BG)
        main.pack(fill="both", expand=True, padx=SP5, pady=SP4)
        for c in range(2):
            main.columnconfigure(c, weight=1)
        # Height is handed to the sections that hold the most fields.
        # DECISION and NEXT ACTION take only what they need — DECISION
        # used to swallow most of the canvas for a four-chip row and one
        # text area, which is exactly backwards: it is the shortest thing
        # to write on the page and was given the most room to write it.
        main.rowconfigure(0, weight=1)   # IDEA — 4 fields on one row
        main.rowconfigure(1, weight=2)   # ANALYSIS | FINANCIAL — 4 each
        main.rowconfigure(2, weight=0)   # DECISION — chips + one field
        # Row 3 holds NEXT ACTION and PEOPLE side by side, and it is
        # WEIGHTED. PEOPLE is the only block on this page whose height is
        # driven by data rather than by layout: every person added makes
        # it a line taller. Left at weight 0 it simply grew past the
        # bottom of a window that has no scrollbar, so the fourth or
        # fifth person you added silently vanished off-screen. With a
        # weight it takes its share and the text areas above give ground
        # instead — they can shrink, a list of people cannot.
        main.rowconfigure(3, weight=2)   # NEXT ACTION | PEOPLE

        # DECISION's GO/VALIDATE/PIVOT/NO-GO selector — a small hand-built
        # segmented control (no reusable one exists elsewhere in this file)
        # styled with the same hover/press language used across the app.
        _DECISION_OPTS = [
            ("GO", "#2F9E44"),
            ("VALIDATE", "#F08C00"),
            ("PIVOT", "#4C6EF5"),
            ("NO-GO", "#E03131"),
        ]

        def _build_decision_selector(frame):
            frame.columnconfigure(tuple(range(len(_DECISION_OPTS))), weight=1)
            current = tk.StringVar(value=vd.get("ba_decision_status", ""))
            btns = {}

            def _paint():
                for opt, col in _DECISION_OPTS:
                    b = btns[opt]
                    if current.get() == opt:
                        b.config(bg=col, fg="#FFFFFF")
                    else:
                        tint = (_hex_tint_dark(col, 0.12) if night
                                else _hex_tint(col, 0.10))
                        b.config(bg=tint, fg=col)

            def _pick(opt):
                def _h(e=None, _o=opt):
                    _was = current.get()
                    current.set("" if _was == _o else _o)
                    _now = current.get()
                    vd["ba_decision_status"] = _now
                    # Log the CHANGE, not the state.
                    #
                    # This is the one field on the page whose history is
                    # the actual information: "GO in July, PIVOT in
                    # September" is the story of the business, and
                    # overwriting the box destroys exactly the thing
                    # worth reading a year from now. The same argument
                    # that made Product Journey a dated record.
                    #
                    # The reason is captured AUTOMATICALLY from the WHY
                    # box as it stood at this moment, rather than asking
                    # for it again. Asking would produce one of two
                    # useless logs: an empty one, because nobody retypes,
                    # or one full of text that has since gone stale.
                    if _now != _was:
                        _log = vd.get("ba_decision_log")
                        _log = list(_log) if isinstance(_log, list) else []
                        _log.append({
                            "date": str(date.today()),
                            "from": _was or "—",
                            "to": _now or "—",
                            "why": (vd.get("ba_decision_why", "") or "").strip(),
                        })
                        vd["ba_decision_log"] = _log[-40:]
                        _render_dec_log()
                    save_data(self)
                    _saved()
                    _paint()
                return _h

            for i, (opt, col) in enumerate(_DECISION_OPTS):
                b = tk.Label(frame, text=opt, font=FONT_HDR_UTILITY,
                             cursor="hand2", padx=10, pady=6)
                b.grid(row=0, column=i, sticky="ew", padx=(10 if i == 0 else 4,
                       10 if i == len(_DECISION_OPTS) - 1 else 4),
                       pady=(6, 8))
                b.bind("<Button-1>", _pick(opt))
                btns[opt] = b
            _paint()

        # ── Section + field builders ─────────────────────────────────────────
        SEC_BY_KEY = {s[0]: s for s in SECTIONS}

        def _section_card(parent, row, col, colspan, title, accent,
                          padx, pady):
            """One section: a thin accent rule, a title, and a body that
            the caller fills with fields.

            No per-field card, no per-field border, no per-field tint.
            The original fifteen-box page was heavy because every single
            question was wrapped in its own bordered, tinted, shadowed
            container; repeating that inside the sections would just
            rebuild the same problem at a smaller size. One card per
            section, plain labelled fields within it."""
            outer = tk.Frame(parent, bg=BORDER)
            outer.grid(row=row, column=col, columnspan=colspan,
                       sticky="nsew", padx=padx, pady=pady)
            outer.columnconfigure(0, weight=1)
            outer.rowconfigure(0, weight=1)
            card = tk.Frame(outer, bg=CARD_BG)
            card.grid(row=0, column=0, sticky="nsew", padx=1, pady=1)
            card.columnconfigure(0, weight=1)
            card.rowconfigure(1, weight=1)

            hdr = tk.Frame(card, bg=CARD_BG)
            hdr.grid(row=0, column=0, sticky="ew")
            tk.Frame(hdr, bg=accent, width=3, height=16).pack(
                side="left", fill="y", padx=(0, 8))
            tk.Label(hdr, text=title, bg=CARD_BG, fg=HDR_TEXT,
                     font=(_F, 11, "bold")).pack(side="left", pady=(7, 5))

            body = tk.Frame(card, bg=CARD_BG)
            body.grid(row=1, column=0, sticky="nsew", padx=10, pady=(0, 8))
            body.columnconfigure(0, weight=1)
            return card, hdr, body

        def _field(parent, row, col, field_key, label, lines,
                   padx=(0, 0)):
            """A labelled, autosaving text area — the atom of this page.

            Label above, text below, a hairline under it. That hairline
            is the only separator: a full border per field would put
            twelve boxes back on the screen, and the label already tells
            the eye where one field ends and the next begins."""
            wrap = tk.Frame(parent, bg=CARD_BG)
            wrap.grid(row=row, column=col, sticky="nsew", padx=padx,
                      pady=(6, 0))
            wrap.columnconfigure(0, weight=1)
            # The text row takes any spare height. Without this the
            # fields stayed at their minimum size and the leftover space
            # collected as one dead band at the bottom of the card —
            # unusable, and the biggest thing on screen in a section
            # whose whole point is having room to write.
            wrap.rowconfigure(1, weight=1)
            tk.Label(wrap, text=label, bg=CARD_BG, fg=MUTED,
                     font=(_F, -12, "bold"), anchor="w").grid(
                row=0, column=0, sticky="ew")
            ta = tk.Text(wrap, height=lines,
                         bg=CARD_BG, fg=BODY_TEXT, font=FONT_BODY,
                         relief="flat", bd=0, insertbackground=BODY_TEXT,
                         highlightthickness=0, wrap="word",
                         spacing1=1, spacing3=1, padx=0, pady=2)
            ta.insert("1.0", vd.get(field_key, ""))
            ta.grid(row=1, column=0, sticky="nsew")
            rule = tk.Frame(wrap, bg=BORDER, height=1)
            rule.grid(row=2, column=0, sticky="ew")

            def _save(e=None, _w=ta, _fk=field_key):
                vd[_fk] = _w.get("1.0", "end-1c")
                save_data(self)
                _saved()
            ta.bind("<FocusOut>", _save)
            ta.bind("<KeyRelease>", lambda e, _s=_save, _w=ta:
                    self._debounced_save("ba_" + field_key, 500, _s, None))
            # The rule turns accent while the field has focus — the whole
            # of this page's "where am I" feedback, costing one pixel.
            ta.bind("<FocusIn>", lambda e, _r=rule, _a=accent_of(field_key):
                    _r.config(bg=_a))
            ta.bind("<FocusOut>", lambda e, _r=rule: _r.config(bg=BORDER),
                    add="+")
            return ta

        def accent_of(fk):
            for _sk, _st, _sa, _flds in SECTIONS:
                if any(f[0] == fk for f in _flds):
                    return _sa
            return _G_IDEA

        # ── 1. IDEA — full width, all four fields on ONE row ─────────────────
        # Four across rather than 2x2: these four answers are each a
        # sentence, not a paragraph, and putting them side by side means
        # the whole idea is one horizontal read — what it is, what it
        # fixes, who for, what success looks like — before the eye drops
        # to the analysis below it. It also costs half the height, which
        # is what leaves room for ANALYSIS and FINANCIAL to be the
        # tallest sections on the page, as they should be.
        _sk, _title, _acc, _flds = SEC_BY_KEY["idea"]
        _c, _h, _b = _section_card(main, 0, 0, 2, _title, _acc,
                                   (0, 0), (0, 6))
        for _i in range(len(_flds)):
            _b.columnconfigure(_i, weight=1, uniform="idea")
        _b.rowconfigure(0, weight=1)
        for _i, (_fk, _fl, _fh) in enumerate(_flds):
            _field(_b, 0, _i, _fk, _fl, _fh,
                   padx=(0 if _i == 0 else 8,
                         0 if _i == len(_flds) - 1 else 8))

        # ── 2. ANALYSIS | FINANCIAL REALITY — side by side ───────────────────
        for _col, _key in ((0, "analysis"), (1, "financial")):
            _sk, _title, _acc, _flds = SEC_BY_KEY[_key]
            _c, _h, _b = _section_card(
                main, 1, _col, 1, _title, _acc,
                (0, 3) if _col == 0 else (3, 0), (0, 6))
            # Equal weight on every field row, so the section's spare
            # height is shared out as writing room instead of pooling
            # into a dead gap under the last field.
            for _i, (_fk, _fl, _fh) in enumerate(_flds):
                _b.rowconfigure(_i, weight=1)
                _field(_b, _i, 0, _fk, _fl, _fh)

        # ── 3. DECISION — compact: chips on one row, one short field ─────────
        _sk, _title, _acc, _flds = SEC_BY_KEY["decision"]
        _c, _h, _b = _section_card(main, 2, 0, 2, _title, _acc, (0, 0), (0, 6))
        _dec_row = tk.Frame(_b, bg=CARD_BG)
        _dec_row.grid(row=0, column=0, sticky="ew", pady=(6, 0))

        # ── Decision history ────────────────────────────────────────────
        # Collapsed to its most recent line by default. On a page you
        # open in order to MAKE a decision, the history is context, not
        # the task — but it must be visible enough that you remember it
        # exists, so the last change is always shown.
        _dec_log_row = tk.Frame(_b, bg=CARD_BG)
        _dec_log_row.grid(row=2, column=0, sticky="ew", pady=(2, 4))
        _dec_log_row.columnconfigure(0, weight=1)
        _dec_open = {"v": False}

        def _render_dec_log():
            for _w in _dec_log_row.winfo_children():
                _w.destroy()
            _log = vd.get("ba_decision_log")
            _log = _log if isinstance(_log, list) else []
            if not _log:
                return
            _shown = list(reversed(_log)) if _dec_open["v"] else [_log[-1]]
            for _i, _e in enumerate(_shown):
                _txt = "%s   %s → %s" % (_e.get("date", ""),
                                         _e.get("from", "—"),
                                         _e.get("to", "—"))
                _why = (_e.get("why", "") or "").strip()
                if _why:
                    _txt += "   ·   " + _clip(_why, 90)
                tk.Label(_dec_log_row, text=_txt, bg=CARD_BG, fg=MUTED,
                         font=FONT_META, anchor="w", justify="left"
                         ).grid(row=_i, column=0, sticky="ew")
            if len(_log) > 1:
                _more = tk.Label(
                    _dec_log_row,
                    text=("hide history" if _dec_open["v"]
                          else "%d earlier changes" % (len(_log) - 1)),
                    bg=CARD_BG, fg=_acc, font=FONT_META, cursor="hand2")
                _more.grid(row=len(_shown), column=0, sticky="w", pady=(2, 0))

                def _toggle(e=None):
                    _dec_open["v"] = not _dec_open["v"]
                    _render_dec_log()
                _more.bind("<Button-1>", _toggle)

        _build_decision_selector(_dec_row)
        _fk, _fl, _fh = _flds[0]
        _b.rowconfigure(1, weight=1)
        _field(_b, 1, 0, _fk, _fl, _fh)
        _render_dec_log()

        # ── 4. NEXT ACTION — the answer to "what now", plus when ─────────────
        _sk, _title, _acc, _flds = SEC_BY_KEY["next"]
        _c, _h, _b = _section_card(main, 3, 0, 1, _title, _acc, (0, 0), (0, 6))
        _fk, _fl, _fh = _flds[0]
        _b.rowconfigure(0, weight=1)
        _field(_b, 0, 0, _fk, _fl, _fh)

        _meta = tk.Frame(_b, bg=CARD_BG)
        _meta.grid(row=1, column=0, sticky="ew", pady=(8, 2))
        tk.Label(_meta, text="PRIORITY", bg=CARD_BG, fg=MUTED,
                 font=(_F, -12, "bold")).pack(side="left", padx=(0, 6))
        _pri_v = tk.StringVar(value=vd.get("ba_next_priority", ""))
        _pri_btns = {}

        def _paint_pri():
            for _p, _pc in (("HIGH", "#E03131"), ("MED", "#F08C00"),
                            ("LOW", "#868E96")):
                _bw = _pri_btns[_p]
                if _pri_v.get() == _p:
                    _bw.config(bg=_pc, fg="#FFFFFF")
                else:
                    _bw.config(bg=(_hex_tint_dark(_pc, 0.12) if night
                                   else _hex_tint(_pc, 0.10)), fg=_pc)

        def _pick_pri(p):
            def _h(e=None, _p=p):
                _pri_v.set("" if _pri_v.get() == _p else _p)
                vd["ba_next_priority"] = _pri_v.get()
                save_data(self)
                _saved()
                _paint_pri()
            return _h
        for _p, _pc in (("HIGH", "#E03131"), ("MED", "#F08C00"),
                        ("LOW", "#868E96")):
            _bw = tk.Label(_meta, text=_p, font=(_F, -12, "bold"),
                           cursor="hand2", padx=8, pady=2)
            _bw.pack(side="left", padx=(0, 4))
            _bw.bind("<Button-1>", _pick_pri(_p))
            _pri_btns[_p] = _bw
        _paint_pri()

        tk.Label(_meta, text="DEADLINE", bg=CARD_BG, fg=MUTED,
                 font=(_F, -12, "bold")).pack(side="left", padx=(16, 6))
        _dl_v = tk.StringVar(value=vd.get("ba_next_deadline", ""))
        _dl = tk.Entry(_meta, textvariable=_dl_v, width=14,
                       bg=CARD_BG, fg=BODY_TEXT, font=FONT_BODY,
                       relief="flat", bd=0, insertbackground=BODY_TEXT,
                       highlightthickness=1, highlightbackground=BORDER,
                       highlightcolor=_acc)
        _dl.pack(side="left", ipady=2)

        def _save_dl(e=None):
            vd["ba_next_deadline"] = _dl_v.get().strip()
            save_data(self)
            _saved()
        _dl.bind("<FocusOut>", _save_dl)
        _dl.bind("<Return>", _save_dl)

        # ── 5. PEOPLE — who this project depends on ─────────────────────────
        # Circle's new home. It sits under NEXT ACTION deliberately: the
        # question it answers is "who do I need for that", and the most
        # common reason a next action doesn't move is a person who hasn't
        # been chased. A red dot here next to a supplier is the same kind
        # of fact as an empty FINANCIAL REALITY box — a gap in the plan.
        _c, _h, _b = _section_card(main, 3, 1, 1, "PEOPLE", _G_DECIDE,
                                   (0, 0), (0, 0))
        # Scrollable, because this is the one block on the page whose
        # height is set by how many people you have.
        #
        # BUG THIS FIXES: with seven people the last two simply were not
        # drawn — no scrollbar, no cut-off marker, nothing. The list was
        # sorted worst-first, so what fell off the bottom was always the
        # people you were most up to date with, which is exactly why it
        # could go unnoticed for a long time while quietly being wrong.
        _people_wrap = tk.Frame(_b, bg=CARD_BG)
        _people_wrap.grid(row=0, column=0, sticky="nsew", pady=(4, 2))
        _people_wrap.columnconfigure(0, weight=1)
        _people_wrap.rowconfigure(0, weight=1)
        _b.rowconfigure(0, weight=1)
        _people_host = self._plan_scroll_host(_people_wrap, CARD_BG)

        def _people_refresh():
            for _w in _people_host.winfo_children():
                _w.destroy()
            # Repaint just this section, never _apply_theme: a full
            # rebuild closes and reopens every project window, so ticking
            # off a phone call would shut the page you were reading.
            self._build_circle_section(
                _people_host, key, CARD_BG, BODY_TEXT, MUTED, MUTED,
                _acc, _PANEL_COLORS[self._mode], rebuild=_people_refresh)
        _people_refresh()

        # ── Close ─────────────────────────────────────────────────────────────
        def _on_close():
            self._auto_timer_on_close(key)
            try:
                self._detail_geometries[key] = (
                    "zoomed" if win.state() == "zoomed" else win.geometry())
                save_data(self)
            except Exception as _e:
                log.debug("suppressed: %s", _e)
            try:
                delattr(self, win_attr)
            except Exception as _e:
                log.debug("suppressed: %s", _e)
            win.destroy()
        win.protocol("WM_DELETE_WINDOW", _on_close)

    # ── Project Journey ──────────────────────────────────────────────────
    _JOURNEY_STAGES = (
        # (name, description, icon) — plain monochrome glyphs, not
        # color emoji: emoji render as fixed multi-color bitmaps in
        # most fonts and ignore the Canvas `fill` color entirely, so
        # they never match the current theme's accent — these thin
        # geometric symbols pick up the theme color properly and read
        # as a modern, flat icon set instead.
        ("Product Research", "সমস্যা ও সুযোগ খুঁজে বের করা", "⌕"),
        ("Sales Channel Development", "ওয়েবসাইট / ল্যান্ডিং পেজ", "▦"),
        ("Search Engine Optimization",
         "প্রোডাক্ট কন্টেন্ট / ক্রিয়েটিভ", "✎"),
        ("Viral Content", "অপ্টিমাইজ ও প্রস্তুত করা", "◎"),
        ("Customer Acquisition", "ভিজিটর ও কাস্টমার আনা", "↗"),
        ("Sales and Feedback", "আয়, উৎক্ষেপণ ও বৃদ্ধি", "◆"),
    )

    def _open_project_journey(self, key, cfg):
        """Calm, single-focus 'Product Journey' page: the whole journey is
        visible, but only the NEXT task actually matters today. Deliberately
        NOT a dashboard/Jira clone — no charts, no counters, no streaks.

        Journey state lives in self._habit_data under '__journey_<key>',
        not in vision_data — vision_data's save_data()/clean_vision() only
        persists a fixed per-project key whitelist, so anything new added
        there gets silently dropped on save. _habit_data is saved whole,
        same reason the (now-removed) Daily Planner kept its data there.

        Stage completion here means EVERY task in that stage is done (not
        an arbitrary milestone count) — that's what triggers illumination
        and auto-advance to the next stage (spec §11/§12).
        """
        win_attr = f"_journey_win_{key}"
        existing = getattr(self, win_attr, None)
        if existing:
            try:
                if existing.winfo_exists():
                    self._bring_window_front(existing)
                    return
            except Exception:
                pass

        vd = self.vision_data.get(key, {})
        default_title = vd.get("title", "") or cfg["label"]

        jkey = f"__journey_{key}"
        jd = self._habit_data.setdefault(jkey, {})
        N = len(self._JOURNEY_STAGES)
        jd.setdefault("stage", 0)
        jd.setdefault("names", [s[0] for s in self._JOURNEY_STAGES])
        jd.setdefault("descs", [s[1] for s in self._JOURNEY_STAGES])
        jd.setdefault("proj_name", default_title)
        jd.setdefault("tagline", "Product Idea → Launch")
        jd.setdefault("cover_image", "")
        jd.setdefault("attach_file", "")  # optional linked .docx/.xlsx path
        jd.setdefault("collapsed", {})
        if len(jd.get("tasks", [])) != N:
            jd["tasks"] = [[] for _ in range(N)]
        if len(jd.get("notes", [])) != N:
            jd["notes"] = ["" for _ in range(N)]
        # ── Exit gates ───────────────────────────────────────────────────────
        # One line per stage saying what must be TRUE for the stage to be
        # over, plus a tick for whether it has happened.
        #
        # Why: "all the tasks I wrote down are ticked" is a weak
        # definition of done. It measures the checklist you happened to
        # remember writing, not the outcome — so a stage could complete,
        # and the journey auto-advance, on three ticks that changed
        # nothing in the real world. A gate is deliberately phrased as
        # something the OUTSIDE world decides ("3 suppliers sent a
        # price"), which is the only kind of progress worth advancing on.
        #
        # Added with the same setdefault/length-check pattern the names
        # and descs already use, so an existing __journey_* record just
        # gains two empty lists and loses nothing.
        if len(jd.get("gates", [])) != N:
            jd["gates"] = ["" for _ in range(N)]
        if len(jd.get("gate_done", [])) != N:
            jd["gate_done"] = [False for _ in range(N)]
        # ── Per-heading LOG ──────────────────────────────────────────────────
        # This page is a trial-and-error test record, not a pipeline: you
        # find something out, you write it down, whichever heading it
        # belongs under. The old single NOTES box per stage was the wrong
        # shape for that — one editable box means the previous finding is
        # either scrolled past or typed over, and in trial-and-error the
        # thing you most need six months later is the attempt that
        # FAILED, so you don't repeat it.
        #
        # A log is append-only and dated: one line, Enter, it stays.
        # Each entry carries a status — "ok" it worked, "no" it didn't,
        # "" just information — because separating those three is the
        # entire point of keeping a test record.
        #
        # entry = {"t": text, "d": "YYYY-MM-DD", "s": "" | "ok" | "no"}
        if len(jd.get("logs", [])) != N:
            jd["logs"] = [[] for _ in range(N)]
        # Which headings are expanded. Missing key = "use the default",
        # which is: the stage you're on is open, the rest are closed.
        if not isinstance(jd.get("open_stages"), dict):
            jd["open_stages"] = {}
        # Existing NOTES text is carried in as the first log entry so
        # nothing written before today is lost. jd["notes"] is left in
        # place untouched (not deleted, just no longer displayed) — if
        # this turns out to be the wrong shape, the original text is
        # still sitting in the save file exactly where it always was.
        if not jd.get("_notes_migrated"):
            _today_s = str(date.today())
            for _i in range(N):
                _old = (jd["notes"][_i] or "").strip()
                if _old and not jd["logs"][_i]:
                    jd["logs"][_i] = [{"t": _old, "d": _today_s, "s": ""}]
            jd["_notes_migrated"] = True
        jd.pop("next_override", None)  # retired — no "NEXT task" hero anymore
        jd["stage"] = max(0, min(N - 1, int(jd.get("stage", 0) or 0)))

        def _stage_done(i):
            """Is stage i finished?

            Two rules, and which one applies depends on whether a gate
            has been written — that is what makes this change safe to
            ship onto existing data:

              gate written  -> the gate's tick decides, and ONLY it.
                               Tasks become supporting detail; you can
                               finish a stage with tasks still open, and
                               ticking every task no longer ends it.
              gate empty    -> the original rule, unchanged: every task
                               done (and at least one task exists).

            So nothing about a project behaves differently until the
            moment its owner writes a condition for that stage."""
            if (jd["gates"][i] or "").strip():
                return bool(jd["gate_done"][i])
            ts = jd["tasks"][i]
            return bool(ts) and all(t.get("done") for t in ts)

        def _recompute_stage():
            """Current stage is always the first not-yet-done stage —
            recomputed live so it can never drift out of sync (e.g. a
            task getting un-checked or deleted after the stage had
            advanced)."""
            for i in range(N):
                if not _stage_done(i):
                    jd["stage"] = i
                    return
            jd["stage"] = N - 1

        _recompute_stage()  # correct any stage saved by an older logic

        def _task_wrap_text(txt, chars_per_line=30, max_lines=3):
            """Wrap task text onto up to max_lines lines, ellipsizing
            any overflow so long task names stay contained in the
            card instead of stretching it or getting clipped."""
            lines = textwrap.wrap(txt, width=chars_per_line) or [""]
            if len(lines) > max_lines:
                lines = lines[:max_lines]
                last = lines[-1].rstrip()[:max(0, chars_per_line - 1)]
                lines[-1] = last + "…"
            return "\n".join(lines)

        # Palette follows the app's active theme (self.T(...)) instead
        # of a fixed emerald look, so Project Journey matches whichever
        # of the 5 themes (Focus / War Room / Energy / Executive /
        # Journey) is currently selected app-wide.
        BG = self.T("BG")
        CARD = self.T("CARD_BG")
        BORDER = self.T("CARD_BORDER")
        MINT = self.T("GREEN")
        MINT_DIM = self.T("GREEN2")
        TEXT = self.T("TEXT")
        TEXT2 = self.T("TEXT2")
        TEXT3 = self.T("TEXT3")
        INPUT_BG = self.T("INPUT_BG")
        DANGER = self.T("RED")
        ON_MINT = self.T("DARK")
        # The TASKS cards used to carry this drop shadow. They are
        # now borderless (see _build_task_card), and the stage node
        # circles were removed with the vertical-timeline redesign,
        # so nothing on this page is elevated any more.

        # RIZE is a FLAT theme: hairline borders, no elevation.
        #
        # An offset drop-shadow was the single biggest thing making this
        # page read as dated — a 2-3px hard grey shadow under every card
        # and node is a 2010-era skeuomorphic cue, and it fights the
        # clean white/grey look the rest of the Rize theme is going for.
        # On Rize the shadow tint becomes the border colour and the
        # offset collapses to an even 1px, so the same widget structure
        # renders as a crisp outline instead of a raised card. Every
        # other theme keeps its shadow exactly as before.
        FLAT = (self._mode == "rize")
        SH_OFF = 1 if FLAT else 2

        def _hex_blend(c1, c2, t):
            """Blend c1 -> c2 by t (0..1). Used to strengthen the
            connector arrows without hardcoding a new color per theme."""
            r1, g1, b1 = int(c1[1:3], 16), int(c1[3:5], 16), int(c1[5:7], 16)
            r2, g2, b2 = int(c2[1:3], 16), int(c2[3:5], 16), int(c2[5:7], 16)
            return "#{:02X}{:02X}{:02X}".format(
                int(r1 + (r2 - r1) * t), int(g1 + (g2 - g1) * t),
                int(b1 + (b2 - b1) * t))
        # (CONNECTOR_INACTIVE lived here for the arrows between the old
        # horizontal nodes; the vertical timeline has no connectors.)

        # 26pt read as a banner rather than a title — it was the largest
        # text anywhere in the app, for a project name you already know.
        F_NAME = (_F, 19, "bold")
        F_SUB = (_F, 11)
        # Not bold. The task rows were rendering heavier than the
        # findings above them, which inverted the page's own priority —
        # the log is what gets written every day; the tasks under it are
        # the least of the three (see _build_task_card). Weight should
        # follow importance, and here it was doing the opposite.
        F_TASK = (_F, 12)
        F_TASK_DONE = (_F, 12, "overstrike")
        F_ADD = (_F, 10)
        F_HIST = (_F, 12)

        win = tk.Toplevel(self)
        setattr(self, win_attr, win)
        win.title(f"{jd['proj_name']}  —  Product Journey")
        win.configure(bg=BG)
        self._setup_window(win, jkey, "1180x760+30+30")
        self._auto_timer_on_open(key)

        outer = tk.Frame(win, bg=BG)
        outer.pack(fill="both", expand=True, padx=SP4, pady=(SP5, 0))

        # ── Cover banner — full width, ~2in tall, click to set/change.
        # Cover-fit crop (like CSS background-size:cover) so the banner
        # never letterboxes or distorts regardless of the source image's
        # aspect ratio. Uses Pillow for a crisp resize when available,
        # falling back to a plain-tkinter (blockier) resize otherwise —
        # this is the only place in the app that touches Pillow.
        _COVER_H = 192  # ~2 inches at 96dpi
        cover_wrap = tk.Frame(outer, bg=CARD, height=_COVER_H)
        cover_wrap.pack(fill="x", pady=(0, SP4))
        cover_wrap.pack_propagate(False)
        _cover_photo = {"img": None}
        _cover_job = {"id": None}

        def _pick_cover():
            path = filedialog.askopenfilename(
                parent=win,
                title="Choose cover image",
                filetypes=[("Images",
                            "*.png *.jpg *.jpeg *.webp *.bmp *.gif")])
            # The file dialog can drop the Journey window behind the
            # main app window once it closes — bring it back to front
            # instead of leaving the user looking at the dashboard.
            win.lift()
            win.focus_force()
            if not path:
                return
            jd["cover_image"] = path
            save_data(self)
            _render_cover()

        def _cover_fit_crop_pil(path, w, h):
            im = PILImage.open(path)
            im = PILImageOps.exif_transpose(im)
            im = PILImageOps.fit(
                im, (w, h), method=PILImage.LANCZOS).convert("RGBA")
            # Fade the bottom of the banner toward the page background
            # so a busy/colorful cover photo doesn't out-compete the
            # actual functional content (stage row, tasks) sitting
            # right below it — purely decorative, so it shouldn't be
            # the loudest thing on the page.
            bg_rgb = tuple(int(BG[j:j + 2], 16) for j in (1, 3, 5))
            fade = PILImage.new("RGBA", (w, h), (0, 0, 0, 0))
            draw = PILImageDraw.Draw(fade)
            fade_start = int(h * 0.55)
            span = max(1, h - fade_start)
            for y in range(fade_start, h):
                t = (y - fade_start) / span
                alpha = int(185 * (t ** 1.4))
                draw.line([(0, y), (w, y)], fill=(*bg_rgb, alpha))
            im = PILImage.alpha_composite(im, fade)
            return PILImageTk.PhotoImage(im)

        def _cover_fit_crop_plain(path, w, h):
            src = tk.PhotoImage(file=path)
            sw, sh = src.width(), src.height()
            if sw <= 0 or sh <= 0:
                return src
            scale = max(w / sw, h / sh)
            # tk.PhotoImage only zooms/subsamples by integer factors, so
            # this is an approximation, not a pixel-exact cover-fit.
            factor = max(1, round(1 / scale)) if scale < 1 else 1
            zoomed = src.zoom(max(1, round(scale)), max(1, round(scale)))
            if factor > 1:
                zoomed = zoomed.subsample(factor, factor)
            zw, zh = zoomed.width(), zoomed.height()
            x0 = max(0, (zw - w) // 2)
            y0 = max(0, (zh - h) // 2)
            out = tk.PhotoImage(width=w, height=h)
            out.tk.call(out, "copy", zoomed, "-from", x0, y0,
                        x0 + w, y0 + h, "-to", 0, 0)
            return out

        def _render_cover():
            for w in cover_wrap.winfo_children():
                w.destroy()
            path = jd.get("cover_image", "")
            if not path or not os.path.exists(path):
                # Collapse to a slim strip when there is no image.
                #
                # An empty 192px placeholder spent the top quarter of the
                # window — the part you see before scrolling — advertising
                # a decoration, and pushed the first stage and its log
                # below it. This page is a dated test record; the thing
                # above the fold should be the record. The invitation
                # survives as one quiet line, and the full-height frame
                # comes back the moment an image is actually set.
                cover_wrap.config(height=34)
                ph = tk.Label(cover_wrap, bg=CARD, fg=TEXT3,
                              text="+  Cover image",
                              font=F_SUB, cursor="hand2")
                ph.pack(fill="both", expand=True)
                ph.bind("<Button-1>", lambda e: _pick_cover())
                _hover(ph, CARD, CARD, TEXT3, TEXT2)
                return
            cover_wrap.config(height=_COVER_H)
            cw = max(cover_wrap.winfo_width(), 400)
            try:
                if _PIL_OK:
                    photo = _cover_fit_crop_pil(path, cw, _COVER_H)
                else:
                    photo = _cover_fit_crop_plain(path, cw, _COVER_H)
            except Exception:
                jd["cover_image"] = ""
                save_data(self)
                _render_cover()
                return
            _cover_photo["img"] = photo
            lbl = tk.Label(cover_wrap, image=photo, bg=CARD, bd=0,
                           cursor="hand2")
            lbl.pack(fill="both", expand=True)
            change_lbl = tk.Label(
                cover_wrap, text="Change cover", bg=BG, fg=TEXT,
                font=F_ADD, cursor="hand2", padx=6, pady=2)
            change_lbl.place(relx=1.0, rely=1.0, anchor="se",
                             x=-8, y=-8)
            for w in (lbl, change_lbl):
                w.bind("<Button-1>", lambda e: _pick_cover())

        def _on_cover_configure(e=None):
            if _cover_job["id"]:
                try:
                    win.after_cancel(_cover_job["id"])
                except Exception:
                    pass
            _cover_job["id"] = win.after(150, _render_cover)

        cover_wrap.bind("<Configure>", _on_cover_configure)
        _render_cover()

        def _rename_meta(is_tagline):
            field = "tagline" if is_tagline else "proj_name"
            cur_txt = jd[field]
            popup = tk.Toplevel(win)
            popup.title("Rename")
            popup.configure(bg=CARD)
            popup.transient(win)
            popup.geometry(
                f"+{win.winfo_rootx() + 80}+{win.winfo_rooty() + 80}")
            ent = tk.Entry(popup, bg=CARD, fg=TEXT, insertbackground=TEXT,
                           relief="flat", font=F_TASK, width=42,
                           highlightthickness=1, highlightbackground=BORDER,
                           highlightcolor=MINT)
            ent.insert(0, cur_txt)
            ent.pack(padx=SP3, pady=SP3)
            ent.focus_set()
            ent.select_range(0, "end")

            def _save(e=None):
                v = ent.get().strip() or cur_txt
                jd[field] = v
                save_data(self)
                popup.destroy()
                win.title(f"{jd['proj_name']}  —  Product Journey")
                name_lbl.config(text=_title_case(jd["proj_name"]))
            ent.bind("<Return>", _save)
            ent.bind("<Escape>", lambda e: popup.destroy())
            tk.Button(popup, text="Save", command=_save, bg=MINT,
                      fg=ON_MINT, relief="flat", bd=0, font=F_HIST,
                      padx=SP3).pack(pady=(0, SP3))

        # ── Header — editable project name + tagline. No "Stage X of Y"
        # badge here on purpose — the journey diagram below already shows
        # the current stage, a duplicate readout is just noise. ─────────
        hdr = tk.Frame(outer, bg=BG)
        hdr.pack(fill="x")
        hl = tk.Frame(hdr, bg=BG)
        hl.pack(side="left", fill="x", expand=True)
        name_lbl = tk.Label(hl, text=_title_case(jd["proj_name"]), bg=BG,
                            fg=TEXT, font=F_NAME, anchor="w",
                            cursor="hand2")
        name_lbl.pack(fill="x")
        name_lbl.bind("<Double-Button-1>", lambda e: _rename_meta(False))
        _add_tooltip(name_lbl, "Double-click to rename")

        # ── Attach file — optional link to a supporting Word/Excel doc
        # (spec, brief, budget sheet, etc.). We never copy or read the
        # file's contents; we just remember the path and hand off to the
        # OS's own default app (Word/Excel/LibreOffice/whatever is
        # installed) to open it — same "launch, don't embed" approach
        # already used for the cover image picker above. ───────────────
        hr = tk.Frame(hdr, bg=BG)
        hr.pack(side="right")

        def _open_attach_file():
            path = jd.get("attach_file", "")
            if not path or not os.path.exists(path):
                return
            try:
                if sys.platform.startswith("win"):
                    os.startfile(path)
                elif sys.platform == "darwin":
                    subprocess.Popen(["open", path])
                else:
                    subprocess.Popen(["xdg-open", path])
            except Exception as _e:
                log.debug("open attach_file: %s", _e)

        def _pick_attach_file():
            path = filedialog.askopenfilename(
                parent=win,
                title="Attach Word / Excel file",
                filetypes=[("Word & Excel",
                            "*.docx *.doc *.xlsx *.xls *.xlsm *.csv"),
                           ("Word documents", "*.docx *.doc"),
                           ("Excel spreadsheets", "*.xlsx *.xls *.xlsm"),
                           ("All files", "*.*")])
            win.lift()
            win.focus_force()
            if not path:
                return
            jd["attach_file"] = path
            save_data(self)
            _render_attach_btn()

        def _clear_attach_file(e=None):
            jd["attach_file"] = ""
            save_data(self)
            _render_attach_btn()
            return "break"

        def _render_attach_btn():
            for w in hr.winfo_children():
                w.destroy()
            path = jd.get("attach_file", "")
            if path and os.path.exists(path):
                fname = os.path.basename(path)
                if len(fname) > 24:
                    fname = fname[:21] + "…"
                btn = tk.Label(hr, text="+  " + fname, bg=BG, fg=TEXT2,
                               font=F_ADD, cursor="hand2", padx=8, pady=4)
                btn.pack(side="left")
                btn.bind("<Button-1>", lambda e: _open_attach_file())
                _hover(btn, BG, BG, TEXT2, TEXT)
                _add_tooltip(btn, "Click to open · double-click to detach")
                btn.bind("<Double-Button-1>", _clear_attach_file)
            else:
                btn = tk.Label(hr, text="+  Attach Word/Excel", bg=BG,
                               fg=TEXT3, font=F_ADD, cursor="hand2",
                               padx=8, pady=4)
                btn.pack(side="left")
                btn.bind("<Button-1>", lambda e: _pick_attach_file())
                _hover(btn, BG, BG, TEXT3, TEXT2)
                _add_tooltip(btn, "Link a supporting Word/Excel file")

        _render_attach_btn()

        # ── Journey — circular icon nodes connected by an illuminating
        # line, each with its own always-visible TASKS card underneath.
        # No illustration/photo — icons + circles are drawn on small
        # per-node Canvases (clean vector shapes only). Current stage
        # gets a soft glow ring; completed gets a solid ✓; nothing is
        # blown up in size — hierarchy comes from color/glow, not scale.
        journey_wrap = tk.Frame(outer, bg=BG)
        journey_wrap.pack(fill="x", pady=(SP5, SP3))
        # (The 64px node circles and the arrow connectors between them
        # went with the switch to a vertical timeline — a number chip
        # carries the same state in a fraction of the space, and a
        # top-to-bottom list needs no arrows to say which way it flows.)
        # Any note box with an unsaved, debounced edit registers itself
        # here (stage index -> (flush_fn, after_job_id)). Rendering can
        # be triggered by an unrelated click (e.g. a task checkbox in
        # another card, or this same card) that doesn't pass through
        # the note box's own <FocusOut>, so before any full re-render
        # wipes the widgets we flush every pending note first —
        # otherwise the last few keystrokes are silently lost.
        _note_pending = {}      # i -> (note_box_widget, flush_fn, job_id)
        _active_task_edit = {"widget": None, "commit": None}

        def _widget_within(root, w):
            while w is not None:
                if w == root:
                    return True
                w = getattr(w, "master", None)
            return False

        def _global_outside_commit(e):
            """A click anywhere — including on inert background Frames
            that never take keyboard focus — commits any open note or
            in-progress task edit whose widget the click landed
            outside of. <FocusOut> alone isn't reliable here since
            Labels/Frames don't take focus on click, so it can silently
            never fire and leave edits stuck unsaved."""
            target = e.widget
            for ii, (nb, flush, jid) in list(_note_pending.items()):
                if _widget_within(nb, target):
                    continue
                if jid:
                    try:
                        win.after_cancel(jid)
                    except Exception:
                        pass
                try:
                    flush()
                except Exception:
                    pass
                _note_pending.pop(ii, None)
            aw = _active_task_edit.get("widget")
            ac = _active_task_edit.get("commit")
            if aw is not None and ac is not None and \
                    not _widget_within(aw, target):
                try:
                    ac()
                except Exception:
                    pass

        win.bind("<Button-1>", _global_outside_commit, add="+")

        def _rename_click(i):
            _rename(i, False)

        def _note_line_count(text, chars_per_line=32):
            """Character-based line estimate — deterministic, unlike
            Tk's own displaylines count which depends on the widget
            already having its final on-screen width. Using Tk's count
            right after the widget is created (before the grid/uniform
            columns have settled) reads a stale/default width and
            over-counts, permanently over-sizing the box."""
            if not text:
                return 1
            total = 0
            for raw_line in text.split("\n"):
                wrapped = textwrap.wrap(raw_line, width=chars_per_line)
                total += len(wrapped) or 1
            return max(1, total)

        def _resize_note(nb):
            if not nb.winfo_exists():
                return
            n = _note_line_count(nb.get("1.0", "end-1c"))
            nb.configure(height=max(1, min(n, 8)))

        def _render_journey():
            for _nb, _flush, _jid in _note_pending.values():
                if _jid:
                    try:
                        win.after_cancel(_jid)
                    except Exception:
                        pass
                try:
                    _flush()
                except Exception:
                    pass
            _note_pending.clear()
            _active_task_edit["widget"] = None
            _active_task_edit["commit"] = None
            for w in journey_wrap.winfo_children():
                w.destroy()
            cur = jd["stage"]
            names = jd["names"]
            journey_wrap.columnconfigure(0, weight=1)

            # ── VERTICAL TIMELINE ────────────────────────────────────────
            # Was six columns side by side. Two problems with that:
            #
            # 1. Width. This window is often opened beside the docked
            #    main window, so each of the six columns got ~150px —
            #    enough for a wrapped title and a squeezed task card, and
            #    nothing could be read comfortably.
            # 2. Weight. All six stages were rendered at full size all
            #    the time, so the one you are actually IN had to compete
            #    with five you are not. A journey has a position; the
            #    layout didn't show one.
            #
            # Stacked vertically, the page can say what it's for: the
            # stages you've finished collapse to a single line, the one
            # you're in is open with its notes and tasks, and the ones
            # ahead are just names. Reading top to bottom is also how a
            # journey actually reads — left-to-right columns of equal
            # weight read as a comparison table instead.
            for i in range(N):
                done_i = _stage_done(i)
                is_cur = i == cur
                # ANY heading can be opened, not just the one you're
                # "on". A test record gets written into whichever
                # heading the finding belongs under — you can learn
                # something about suppliers while working on SEO — so
                # forcing everything except the current stage shut was
                # the layout fighting the way the page is actually used.
                # The current stage is still the one that opens by
                # default and still carries the accent; it just no
                # longer hides the others.
                _open = bool(jd["open_stages"].get(str(i), is_cur))

                block = tk.Frame(journey_wrap, bg=BG)
                block.grid(row=i, column=0, sticky="ew",
                           pady=(0, SP2 if _open else 1))
                block.columnconfigure(2, weight=1)

                # ── Number chip, in place of the old node circle ─────────
                # A numbered chip rather than a 64px canvas circle with a
                # glyph in it: same information, a fraction of the space,
                # and it matches the numbered segments on the PLAN
                # progress bar so the two read as one language.
                # On the dark themes MINT is a bright mint/cyan, so the
                # near-black ON_MINT reads well on it. On the light
                # themes MINT is a mid-tone accent (indigo, slate blue,
                # red) and near-black on it is muddy — white is the
                # legible choice there, same as every filled accent
                # button elsewhere in the app.
                # Done = filled accent with a tick. CURRENT = the pale
                # accent tint, not a filled block. Rize marks its active
                # item with a soft tinted pill and accent text, and never
                # with the heaviest treatment available; a filled chip
                # plus a bold near-black title beside it was saying "you
                # are here" twice, loudly.
                _num_bg = (MINT if done_i
                           else (self.T("GREEN_LIGHT") if is_cur else CARD))
                _num_fg = ((ON_MINT if self._mode in ("warroom", "journey")
                            else "#FFFFFF") if done_i
                           else (MINT if is_cur else TEXT3))
                chip = tk.Label(block, text=("✓" if done_i else str(i + 1)),
                                bg=_num_bg, fg=_num_fg,
                                font=(_F, 10, "bold"), width=3,
                                cursor="hand2")
                chip.grid(row=0, column=0, sticky="w", padx=(0, SP3),
                          pady=2)
                chip.bind("<Double-Button-1>",
                          lambda e, ii=i: _rename_click(ii))
                _add_tooltip(chip, "Double-click to rename")

                # ── Stage name ──────────────────────────────────────────
                # Title Case, and NOT near-black.
                #
                # Compared side by side with Rize, the giveaway was that
                # this page put six UPPERCASE BOLD NEAR-BLACK titles down
                # the left edge. Rize never uses that combination: in it,
                # uppercase always means a small muted or accent-coloured
                # label, and the darkest ink on screen is reserved for
                # DATA — the numbers. Everything structural is grey.
                #
                # So the stage NAMES become names again (they are content
                # you can rename, not labels), the current one takes the
                # accent rather than black, and the finished/future ones
                # drop their bold entirely. The only uppercase left on
                # the page is the small caption set — DONE WHEN, WHAT I
                # FOUND OUT, TASKS — which is exactly Rize's rule.
                _st_fg = MINT if is_cur else (TEXT2 if done_i else TEXT3)
                name_lbl2 = tk.Label(
                    block, text=_title_case(str(names[i])), bg=BG,
                    fg=_st_fg,
                    font=(_F, 14, "bold") if is_cur else (_F, 12),
                    cursor="hand2", anchor="w")
                name_lbl2.grid(row=0, column=2, sticky="w")
                name_lbl2.bind("<Double-Button-1>",
                               lambda e, ii=i: _rename_click(ii))
                _hover(name_lbl2, BG, BG, _st_fg, MINT, glow=MINT)

                # ── Right-hand summary, one line ────────────────────────
                # Counts the LOG, not the tasks: what this page holds is
                # findings, so "how much do I know about this part" is
                # the number worth showing on a closed heading.
                _ln = len(jd["logs"][i])
                _sum = (f"{_ln} note" + ("s" if _ln != 1 else "")) if _ln \
                    else ""
                tk.Label(block, text=_sum, bg=BG,
                         fg=MINT if is_cur else TEXT3,
                         font=(_F, 9)).grid(row=0, column=3, sticky="e",
                                            padx=(SP3, 0))

                # Click anywhere on the header row to open / close.
                def _toggle_open(e=None, ii=i, was=_open):
                    jd["open_stages"][str(ii)] = not was
                    save_data(self)
                    _render_journey()
                for _hw in (block, chip, name_lbl2):
                    _hw.bind("<Button-1>", _toggle_open, add="+")

                # ── Exit condition ──────────────────────────────────────
                # Shown on the stage you're in (so you can tick it) and
                # on finished stages (so months later you can still see
                # WHY it was called done). Hidden on future stages —
                # writing conditions for work you haven't started is
                # planning theatre, and six empty rows would bury the one
                # row that matters.
                _gate_txt = (jd["gates"][i] or "").strip()
                if _open or (done_i and _gate_txt):
                    # A caption, because without one this row was simply
                    # a circle and some text — indistinguishable at a
                    # glance from a task's checkbox or a finding's dot.
                    # Three different kinds of row were sharing one page
                    # and only ONE of them (TASKS) said what it was.
                    _gwrap = tk.Frame(block, bg=BG)
                    _gwrap.grid(row=1, column=2, columnspan=2, sticky="ew",
                                pady=(4, 0))
                    _gwrap.columnconfigure(0, weight=1)
                    tk.Label(_gwrap, text="DONE WHEN", bg=BG, fg=TEXT3,
                             font=(_F, 9, "bold"), anchor="w").grid(
                        row=0, column=0, sticky="ew")
                    grow = tk.Frame(_gwrap, bg=BG)
                    grow.grid(row=1, column=0, sticky="ew", pady=(1, 0))
                    grow.columnconfigure(1, weight=1)
                    _gticked = bool(jd["gate_done"][i]) and bool(_gate_txt)
                    gmark = tk.Label(
                        grow, text=("✓" if _gticked else "○"), bg=BG,
                        fg=MINT if _gticked else TEXT3,
                        font=(_F, 11), cursor="hand2", width=2)
                    gmark.grid(row=0, column=0, sticky="w")
                    gmark.bind("<Button-1>", lambda e, ii=i: _toggle_gate(ii))
                    _add_tooltip(gmark, "Mark this condition met")

                    glbl = tk.Label(
                        grow,
                        text=(_gate_txt or "set the exit condition…"),
                        bg=BG,
                        fg=(TEXT2 if _gate_txt else TEXT3),
                        font=(_F, 10) if _gate_txt else (_F, 10, "italic"),
                        cursor="hand2", anchor="w", justify="left",
                        wraplength=520)
                    glbl.grid(row=0, column=1, sticky="ew")
                    glbl.bind("<Button-1>", lambda e, ii=i: _edit_gate(ii))
                    _hover(glbl, BG, BG,
                           (TEXT2 if _gate_txt else TEXT3), MINT, glow=MINT)

                # ── The log ─────────────────────────────────────────────
                if _open:
                    _lwrap = tk.Frame(block, bg=BG)
                    _lwrap.grid(row=2, column=2, columnspan=2, sticky="ew",
                                pady=(SP3, 0))
                    _lwrap.columnconfigure(0, weight=1)
                    # "WHAT I FOUND OUT" names the one thing this page is
                    # for. Without it the dated lines read as a third,
                    # unexplained kind of list.
                    tk.Label(_lwrap, text="WHAT I FOUND OUT", bg=BG,
                             fg=TEXT3, font=(_F, 9, "bold"),
                             anchor="w").grid(row=0, column=0, sticky="ew",
                                              pady=(0, 2))
                    logf = tk.Frame(_lwrap, bg=BG)
                    logf.grid(row=1, column=0, sticky="ew")
                    logf.columnconfigure(0, weight=1)

                    # Input first, above the entries: this box is the
                    # reason the page exists, so it must never be at the
                    # bottom of a list that grows every week.
                    # An underlined field, not a filled box. A solid
                    # INPUT_BG slab the full width of the page was the
                    # single heaviest grey element on screen, and it sat
                    # directly above the findings it was competing with.
                    # This is the same hairline-rule field the Business
                    # Analysis page uses, so the two pages now read as
                    # one app.
                    ent = tk.Entry(logf, bg=BG, fg=TEXT,
                                   insertbackground=TEXT, relief="flat",
                                   font=F_HIST, highlightthickness=0, bd=0)
                    ent.grid(row=0, column=0, sticky="ew", ipady=3)
                    _rule = tk.Frame(logf, bg=BORDER, height=1)
                    _rule.grid(row=0, column=0, sticky="sew")
                    ent.bind("<FocusIn>",
                             lambda e, _r=_rule: _r.config(bg=MINT), add="+")
                    ent.bind("<FocusOut>",
                             lambda e, _r=_rule: _r.config(bg=BORDER), add="+")
                    # Hint text that clears on focus. Written inline
                    # rather than reaching for a shared helper because
                    # the entry's real text IS the value being saved —
                    # any ghost text left in it would be saved as a
                    # finding, so the clearing has to be certain.
                    _PH = "What did you find out?  ·  Enter to save"

                    def _ph_in(e, _p=_PH):
                        if e.widget.get() == _p:
                            e.widget.delete(0, "end")
                            e.widget.config(fg=TEXT)

                    def _ph_out(e, _p=_PH):
                        if not e.widget.get().strip():
                            e.widget.delete(0, "end")
                            e.widget.insert(0, _p)
                            e.widget.config(fg=TEXT3)
                    ent.insert(0, _PH)
                    ent.config(fg=TEXT3)
                    ent.bind("<FocusIn>", _ph_in)
                    ent.bind("<FocusOut>", _ph_out)

                    def _log_submit(e, ii=i, _p=_PH):
                        if e.widget.get().strip() == _p:
                            return
                        _log_add(ii, e.widget)
                    ent.bind("<Return>", _log_submit)

                    for j, _en in enumerate(jd["logs"][i]):
                        _s = _en.get("s", "")
                        _mk, _mc = _LOG_MARKS.get(_s, _LOG_MARKS[""])
                        erow = tk.Frame(logf, bg=BG)
                        erow.grid(row=1 + j, column=0, sticky="ew",
                                  pady=(4, 0))
                        erow.columnconfigure(2, weight=1)

                        m = tk.Label(erow, text=_mk, bg=BG, fg=_mc,
                                     font=(_F, 10, "bold"), width=2,
                                     cursor="hand2")
                        m.grid(row=0, column=0, sticky="nw")
                        m.bind("<Button-1>",
                               lambda e, ii=i, jj=j: _log_cycle(ii, jj))
                        _add_tooltip(m, "Click: info → worked → didn't work")

                        tk.Label(erow, text=_en.get("d", "")[5:], bg=BG,
                                 fg=TEXT3, font=F_XS, width=6,
                                 anchor="w").grid(row=0, column=1,
                                                  sticky="nw", padx=(0, 6))

                        # Failed attempts are struck through and muted —
                        # still readable (that is the point of keeping
                        # them) but visibly not a live finding.
                        # FULL contrast, not TEXT2.
                        #
                        # These lines are the whole reason the page
                        # exists — they are the record. Rendering them in
                        # the muted tone reserved for chrome made the
                        # page read as uniformly ash-grey: labels, dates,
                        # hints and findings all at the same weight, with
                        # nothing to look at first. Only a finding marked
                        # "didn't work" is muted, and that one is
                        # deliberate.
                        tk.Label(
                            erow, text=_en.get("t", ""), bg=BG,
                            fg=TEXT3 if _s == "no" else TEXT,
                            font=(_F, 10, "overstrike") if _s == "no"
                            else (_F, 10),
                            anchor="w", justify="left", wraplength=470
                        ).grid(row=0, column=2, sticky="ew")

                        x = tk.Label(erow, text="✕", bg=BG, fg=BG,
                                     font=F_XS, cursor="hand2")
                        x.grid(row=0, column=3, sticky="ne", padx=(6, 0))
                        x.bind("<Button-1>",
                               lambda e, ii=i, jj=j: _log_delete(ii, jj))
                        # Delete stays invisible until the row is hovered:
                        # an always-visible ✕ on every line of a record
                        # you are trying to accumulate is an invitation to
                        # thin it out.
                        _hover(x, BG, BG, BG, DANGER)
                        for _hw in (erow, x):
                            _hw.bind("<Enter>",
                                     lambda e, _x=x: _x.config(fg=TEXT3),
                                     add="+")
                            _hw.bind("<Leave>",
                                     lambda e, _x=x: _x.config(fg=BG),
                                     add="+")

                    _build_task_card(i, block, done_i, is_cur)

        def _build_task_card(i, block, done_i, is_cur=False):
            """The always-visible TASKS card under stage i — the single
            place its tasks are viewed/added/edited/toggled. A
            persistent, auto-expanding Note box sits above the task
            list: write the note first, then work the tasks below it.

            REDESIGNED per world-class visual review: the previous
            version signalled "this is the current stage" FOUR times at
            once (red node ring + red number + red title + a full
            accent-colored card border/shadow) — on the Energy theme
            especially, wrapping a card in solid red reads as an error/
            validation state, not "you are here". Active-stage emphasis
            now lives ONLY on the three things above this card (node
            ring, number, title) — see the comment there. Every one of
            the 6 cards below uses the exact same neutral shadow, same
            neutral thin left rule, same padding: state, not structure,
            is what's supposed to differ, and now it's the only thing
            that does."""
            n_i = len(jd["tasks"][i])
            d_i = sum(1 for t in jd["tasks"][i] if t.get("done"))
            # One neutral shadow tint for all 6 — no colored/glowing
            # shadow on the active card. A drop-shadow signals "this is
            # a card" (elevation), not "this is the current one"; state
            # is the top node cluster's job alone.
            # Sits inside the stage's own block now (vertical timeline),
            # indented under the number chip and spanning the name column
            # so it lines up with the stage title above it.
            # No border, no fill, no shadow, no left rule.
            #
            # An open stage was stacking four containers — an exit-gate
            # line, a filled input slab, the findings list, and then this
            # bordered-and-shadowed card — so two open stages put eight
            # nested boxes on one page. The caption "TASKS" and its count
            # group these rows perfectly well on their own; the box round
            # them was structure drawn twice.
            shadow_wrap = tk.Frame(block, bg=BG)
            # Block rows: 0 header · 1 gate · 2 log · 3 tasks.
            # Tasks sit last because on this page they are the least of
            # the three — the log is what gets written daily.
            shadow_wrap.grid(row=3, column=2, columnspan=2, sticky="ew",
                             pady=(SP2, 0))
            prev_row = tk.Frame(shadow_wrap, bg=BG)
            # Flat theme: even 1px on all four sides = hairline outline.
            # Other themes: offset only right/bottom = drop shadow.
            if FLAT:
                prev_row.pack(fill="x", padx=1, pady=1)
            else:
                prev_row.pack(fill="x", padx=(0, SH_OFF), pady=(0, SH_OFF))
            # Thin neutral rule, identical on all 6 cards — no colored
            # "active" bar. It exists purely as a quiet structural edge
            # (matches the app's other card systems), not a state signal.
            prev = tk.Frame(prev_row, bg=BG)
            prev.pack(side="left", fill="x", expand=True)
            tk.Frame(prev, bg=CARD, width=270, height=1).pack(
                side="top", fill="x")

            # The single overwritable NOTES box that used to sit here is
            # gone — the dated log above this card replaced it, and two
            # places to write a finding is one place too many: the pause
            # to decide which box it belongs in is exactly what stops
            # things getting written down at all. Existing note text was
            # carried into the log as its first entry (see the migration
            # at the top of this method); jd["notes"] itself is left
            # untouched in the save file.

            # No "CURRENT" text tag, no colored card border — the node
            # ring/number/title above already say "this is active"; this
            # caption is the ONE deliberate, restrained echo of that
            # inside the card itself (level-3 "subtle supporting accent"
            # per the color hierarchy), not a 4th loud repeat of it.
            cap = tk.Frame(prev, bg=CARD)
            cap.pack(fill="x", padx=10, pady=(4, 0))
            tk.Label(cap, text="TASKS", bg=CARD,
                     fg=(MINT if is_cur else TEXT3),
                     font=(_F, 11, "bold")).pack(side="left")
            # Small pill instead of bare text — same "count is data, give
            # it a chip" treatment used for count badges elsewhere in the
            # app, so "0/0" doesn't read as one more flat label lost
            # among the others.
            tk.Label(cap, text=f"{d_i}/{n_i}", bg=INPUT_BG, fg=TEXT2,
                     font=(_F, 10, "bold"), padx=6, pady=1
                     ).pack(side="right")

            if not jd["tasks"][i]:
                # Shortened from "No tasks yet — add your first one
                # below" — with 6 of these stacked side by side, the
                # repeated full sentence read as noise; the "+ Add task"
                # link right underneath already says what to do next.
                tk.Label(prev, text="No tasks yet",
                         bg=CARD, fg=TEXT3, font=F_HIST,
                         wraplength=230, justify="left"
                         ).pack(anchor="w", padx=10, pady=(8, 4))
            shown = jd["tasks"][i][:6]
            for ti, t in enumerate(shown):
                trow = tk.Frame(prev, bg=CARD)
                trow.pack(fill="x", padx=10, pady=(6, 0))
                box = "✓" if t.get("done") else "☐"
                box_col = MINT_DIM if t.get("done") else TEXT2
                bl = tk.Label(trow, text=box, bg=CARD, fg=box_col,
                              font=F_TASK, cursor="hand2")
                bl.pack(side="left", anchor="n")
                bl.bind("<Button-1>",
                        lambda e, si=i, sj=ti: _toggle_task(si, sj))
                _hover(bl, CARD, CARD, box_col, MINT, glow=MINT)
                tfont = F_TASK_DONE if t.get("done") else F_TASK
                tcol2 = TEXT3 if t.get("done") else TEXT
                disp_text = _task_wrap_text(_title_case(t.get("text", "")))
                text_lbl = tk.Label(trow, text=disp_text, bg=CARD,
                                    fg=tcol2, font=tfont, anchor="w",
                                    justify="left", cursor="hand2")
                text_lbl.pack(side="left", padx=(6, SP2), anchor="n")
                text_lbl.bind(
                    "<Double-Button-1>",
                    lambda e, si=i, sj=ti, tl=text_lbl, tr=trow: (
                        _preview_edit(si, sj, tl, tr)))

                ctrl = tk.Frame(trow, bg=CARD)
                del_lbl = tk.Label(ctrl, text="✕", bg=CARD, fg=TEXT3,
                                   font=F_HIST, cursor="hand2")
                del_lbl.pack(side="left")
                del_lbl.bind("<Button-1>",
                             lambda e, si=i, sj=ti: _delete_task(si, sj))
                _hover(del_lbl, CARD, CARD, TEXT3, DANGER,
                       glow=DANGER)

                def _show_c(e=None, c=ctrl):
                    c.pack(side="left", anchor="n")

                def _hide_c(e=None, c=ctrl):
                    c.pack_forget()
                trow.bind("<Enter>", _show_c)
                trow.bind("<Leave>", _hide_c)
            extra = len(jd["tasks"][i]) - len(shown)
            if extra > 0:
                tk.Label(prev, text=f"+{extra} more", bg=CARD, fg=TEXT3,
                         font=F_HIST).pack(anchor="w", padx=10, pady=(2, 0))

            # ── + Add task — click-to-reveal Entry+Send, right in card ──
            add_wrap = tk.Frame(prev, bg=CARD)
            add_wrap.pack(fill="x", padx=10, pady=(6, 4))

            def _render_add():
                for w in add_wrap.winfo_children():
                    w.destroy()
                add_btn = tk.Label(add_wrap, text="+ Add task", bg=CARD,
                                   fg=TEXT3, font=F_ADD, cursor="hand2")
                add_btn.pack(anchor="w")
                _hover(add_btn, CARD, CARD, TEXT3, MINT, glow=MINT)

                def _open(e=None):
                    for w in add_wrap.winfo_children():
                        w.destroy()
                    ent = tk.Entry(add_wrap, bg=INPUT_BG, fg=TEXT,
                                   insertbackground=TEXT, relief="flat",
                                   font=F_ADD, highlightthickness=1,
                                   highlightbackground=BORDER,
                                   highlightcolor=MINT)
                    ent.pack(fill="x", ipady=4)
                    ent.focus_set()

                    def _send(e=None, ii=i, w=ent):
                        v = w.get().strip()
                        if v:
                            jd["tasks"][ii].append(
                                {"text": v, "done": False})
                            save_data(self)
                            _render_journey()
                        else:
                            _render_add()
                    ent.bind("<Return>", _send)
                    ent.bind("<Escape>", lambda e: _render_add())
                add_btn.bind("<Button-1>", _open)

            _render_add()

        def _preview_edit(si, sj, text_lbl, trow):
            """Swap a preview row's Label for an inline Entry to edit
            it — same interaction as the old bottom-panel task list."""
            text_lbl.pack_forget()
            ent = tk.Entry(trow, bg=INPUT_BG, fg=TEXT,
                           insertbackground=TEXT, relief="flat",
                           font=F_TASK, highlightthickness=1,
                           highlightbackground=BORDER,
                           highlightcolor=MINT)
            ent.insert(0, jd["tasks"][si][sj].get("text", ""))
            ent.pack(side="left", padx=(6, SP2), fill="x", expand=True)
            ent.focus_set()
            ent.select_range(0, "end")

            def _commit(e=None):
                if not ent.winfo_exists():
                    return
                _active_task_edit["widget"] = None
                _active_task_edit["commit"] = None
                _edit_task(si, sj, ent.get())
            ent.bind("<Return>", _commit)
            ent.bind("<FocusOut>", _commit)
            ent.bind("<Escape>", lambda e: _render_journey())
            _active_task_edit["widget"] = ent
            _active_task_edit["commit"] = _commit

        toast_lbl = tk.Label(outer, text="", bg=BG, fg=MINT, font=F_HIST)
        toast_lbl.pack(fill="x")

        def _flash(msg):
            toast_lbl.config(text=msg)
            win.after(2200, lambda: toast_lbl.config(text=""))

        # ── Log entry handlers ───────────────────────────────────────────────
        _LOG_MARKS = {"": ("·", TEXT3), "ok": ("✓", MINT), "no": ("✕", DANGER)}

        def _log_add(i, ent):
            txt = ent.get().strip()
            if not txt:
                return
            # Newest first: what you found today is what you need to see,
            # and an append-at-the-bottom list buries it deeper every day.
            jd["logs"][i].insert(
                0, {"t": txt, "d": str(date.today()), "s": ""})
            ent.delete(0, "end")
            save_data(self)
            _render_journey()

        def _log_cycle(i, j):
            """·  →  ✓ worked  →  ✕ didn't work  →  ·"""
            order = ["", "ok", "no"]
            cur_s = jd["logs"][i][j].get("s", "")
            nxt = order[(order.index(cur_s) + 1) % 3] if cur_s in order else ""
            jd["logs"][i][j]["s"] = nxt
            save_data(self)
            _render_journey()

        def _log_delete(i, j):
            from tkinter import messagebox
            _t = jd["logs"][i][j].get("t", "")
            if not messagebox.askyesno(
                    "Delete entry",
                    f'Delete "{_t[:60]}"?\nA test record is only useful if '
                    'it is complete — delete only real mistakes.',
                    parent=win):
                return
            del jd["logs"][i][j]
            save_data(self)
            _render_journey()

        def _edit_gate(idx):
            """Write / change a stage's exit condition."""
            cur_txt = jd["gates"][idx] or ""
            popup = tk.Toplevel(win)
            popup.title("Exit condition")
            popup.configure(bg=CARD)
            popup.transient(win)
            popup.geometry(
                f"+{win.winfo_rootx() + 80}+{win.winfo_rooty() + 80}")
            tk.Label(popup, text="This stage is over when…", bg=CARD,
                     fg=TEXT2, font=F_HIST).pack(anchor="w", padx=SP3,
                                                 pady=(SP3, 0))
            # The hint is doing real work: the whole value of a gate is
            # that it names something the outside world decides, and the
            # instinct when typing here is to write another task.
            tk.Label(popup,
                     text="Something the world does, not something you do.\n"
                          "e.g.  “3 suppliers sent a price”  ·  "
                          "“first order paid”",
                     bg=CARD, fg=TEXT3, font=(_F, 9), justify="left"
                     ).pack(anchor="w", padx=SP3, pady=(0, SP2))
            ent = tk.Entry(popup, bg=CARD, fg=TEXT, insertbackground=TEXT,
                           relief="flat", font=F_TASK, width=46,
                           highlightthickness=1, highlightbackground=BORDER,
                           highlightcolor=MINT)
            ent.insert(0, cur_txt)
            ent.pack(padx=SP3, pady=(0, SP3))
            ent.focus_set()
            ent.select_range(0, "end")

            def _save(e=None):
                jd["gates"][idx] = ent.get().strip()
                # Clearing the text hands the stage back to the old
                # all-tasks-done rule, so a stale tick must not linger.
                if not jd["gates"][idx]:
                    jd["gate_done"][idx] = False
                _recompute_stage()
                save_data(self)
                popup.destroy()
                _render_journey()
            ent.bind("<Return>", _save)
            ent.bind("<Escape>", lambda e: popup.destroy())
            tk.Button(popup, text="Save", command=_save, bg=MINT,
                      fg=ON_MINT, relief="flat", bd=0, font=F_HIST,
                      padx=SP3).pack(pady=(0, SP3))

        def _toggle_gate(idx):
            """Tick / untick the exit condition — this is what finishes a
            stage once a gate exists."""
            if not (jd["gates"][idx] or "").strip():
                _edit_gate(idx)          # nothing to tick yet — write it
                return
            jd["gate_done"][idx] = not bool(jd["gate_done"][idx])
            prev_stage = jd["stage"]
            _recompute_stage()
            save_data(self)
            launched = jd["stage"] == N - 1 and all(
                _stage_done(k) for k in range(N))
            advanced = jd["stage"] > prev_stage and not launched
            _render_journey()
            if launched:
                _flash("PROJECT LAUNCHED!")
            elif advanced:
                _flash("Project advanced to the next stage.")

        def _rename(idx, is_desc):
            cur_txt = (jd["descs"] if is_desc else jd["names"])[idx]
            popup = tk.Toplevel(win)
            popup.title("Rename")
            popup.configure(bg=CARD)
            popup.transient(win)
            popup.geometry(
                f"+{win.winfo_rootx() + 80}+{win.winfo_rooty() + 80}")
            ent = tk.Entry(popup, bg=CARD, fg=TEXT, insertbackground=TEXT,
                           relief="flat", font=F_TASK, width=40,
                           highlightthickness=1, highlightbackground=BORDER,
                           highlightcolor=MINT)
            ent.insert(0, cur_txt)
            ent.pack(padx=SP3, pady=SP3)
            ent.focus_set()
            ent.select_range(0, "end")

            def _save(e=None):
                v = ent.get().strip() or cur_txt
                (jd["descs"] if is_desc else jd["names"])[idx] = v
                save_data(self)
                popup.destroy()
                _render_journey()
            ent.bind("<Return>", _save)
            ent.bind("<Escape>", lambda e: popup.destroy())
            tk.Button(popup, text="Save", command=_save, bg=MINT,
                      fg=ON_MINT, relief="flat", bd=0, font=F_HIST,
                      padx=SP3).pack(pady=(0, SP3))

        def _toggle_task(i, j):
            t = jd["tasks"][i][j]
            t["done"] = not t.get("done", False)
            prev_stage = jd["stage"]
            _recompute_stage()
            save_data(self)
            launched = jd["stage"] == N - 1 and all(
                _stage_done(k) for k in range(N))
            advanced = jd["stage"] > prev_stage and not launched
            _render_journey()
            if launched:
                _flash("\u25B8  PROJECT LAUNCHED")
            elif advanced:
                _flash("Project advanced to the next stage.")

        def _delete_task(i, j):
            from tkinter import messagebox
            try:
                txt = jd["tasks"][i][j].get("text", "this task")
            except (IndexError, KeyError):
                return
            if not messagebox.askyesno(
                    "Delete task", f'Delete "{txt}"? This can\'t be undone.',
                    parent=win):
                return
            del jd["tasks"][i][j]
            _recompute_stage()
            save_data(self)
            _render_journey()

        def _edit_task(i, j, new_text):
            v = new_text.strip()
            if v:
                jd["tasks"][i][j]["text"] = v
            save_data(self)
            _render_journey()

        def _save_note(i, text):
            jd["notes"][i] = text
            save_data(self)

        _render_journey()

        def _on_close():
            self._auto_timer_on_close(key)
            try:
                delattr(self, win_attr)
            except Exception as _e:
                log.debug("suppressed: %s", _e)
            win.destroy()
        win.protocol("WM_DELETE_WINDOW", _on_close)

    # ── Business Plan Notes ─────────────────────────────────────────────────
    _BDP_STATUSES = ("IDEA", "OPPORTUNITY", "RESEARCH", "PLAN",
                     "ACTIVE", "HOLD", "DONE")
    _BDP_PRIORITIES = ("HIGH", "MEDIUM", "LOW")

    def _bdp_seed(self):
        """The six starter opportunities. Only used for a genuinely empty
        planner — see _bdp_load, which never overwrites real notes."""
        def _p(title, status, opportunity, actions, timeline, priority,
               **meta):
            d = {"id": 0, "title": title, "status": status,
                 "opportunity": opportunity, "timeline": timeline,
                 "priority": priority, "notes": "",
                 "next_actions": [{"text": a, "done": False} for a in actions],
                 "potential": 4, "difficulty": 3, "investment": 2,
                 "archived": False}
            d.update(meta)
            return d
        return [
            _p("SUPPLEMENT BUSINESS", "IDEA",
               "High demand for natural skincare and wellness products in "
               "Asian and Middle Eastern markets.",
               ["Product research", "Supplier research",
                "Competitor analysis", "Market validation"],
               "3 Months", "HIGH",
               market="Global", target="Health & Fitness"),
            _p("AMAZON FBA BUSINESS", "OPPORTUNITY",
               "Find products with stable demand, manageable competition "
               "and healthy margins.",
               ["Product research", "Competitor analysis",
                "Sample testing", "Amazon listing"],
               "4 Months", "HIGH",
               market="USA", model="Private Label"),
            _p("LAPTOP WORKSTATION IMPORT", "PLAN",
               "Growing demand for high-performance workstations among "
               "designers, engineers and IT professionals.",
               ["Supplier selection", "Model selection",
                "Import costing", "Local marketing"],
               "2 Months", "MEDIUM",
               market="Bangladesh", niche="Tech & IT"),
            _p("DIGITAL MARKETING AGENCY", "IDEA",
               "Small businesses need affordable digital marketing and "
               "online growth support.",
               ["Define service packages", "Build skills/team",
                "Acquire first clients", "Create recurring revenue"],
               "3 Months", "MEDIUM",
               market="Local + Global", service="SEO / Ads / SMM"),
            _p("PRINT ON DEMAND STORE", "PLAN",
               "Low-inventory e-commerce model using personalized and "
               "trend-based products.",
               ["Niche research", "Product research",
                "Shopify setup", "Marketing"],
               "2 Months", "MEDIUM",
               market="Global", niche="Custom Gifts"),
            _p("EXPORT BUSINESS", "OPPORTUNITY",
               "Bangladeshi food products may have export potential "
               "through competitive pricing and differentiated products.",
               ["Buyer research", "Sample preparation",
                "Compliance documentation", "Shipment"],
               "4 Months", "HIGH",
               market="USA", product="Biscuits & Snacks"),
        ]

    def _bdp_load(self):
        """Return the plans list, migrating the old 6-block format once.

        The previous screen stored six fixed blocks as block_N_title /
        block_N_note. Those are real user writing, so migration converts
        each non-empty block into a plan (title kept, note becomes the
        opportunity text) instead of discarding it. The old keys are left
        in place untouched — if this migration ever proves wrong the
        original text is still on disk. Examples are seeded ONLY when
        there was nothing to migrate at all."""
        self.vision_data.setdefault("self_dev", {})
        vd = self.vision_data["self_dev"]
        if not vd.get("_migrated_v2"):
            migrated = []
            for i in range(6):
                _t = (vd.get(f"block_{i}_title") or "").strip()
                _n = (vd.get(f"block_{i}_note") or "").strip()
                _generic = _t.upper().startswith("PROJECT PLAN")
                if not _n and (_generic or not _t):
                    continue          # untouched default block — skip
                migrated.append({
                    "id": int(time.time() * 1000) + i,
                    "title": _t or f"PLAN {i + 1}",
                    "status": "IDEA", "opportunity": _n,
                    "market": "", "target": "", "niche": "", "model": "",
                    "product": "", "service": "", "supplier": "",
                    "next_actions": [], "timeline": "", "priority": "MEDIUM",
                    "potential": 3, "difficulty": 3, "investment": 2,
                    "notes": "", "archived": False,
                })
            vd["plans"] = migrated or self._bdp_seed()
            for _i, _p in enumerate(vd["plans"]):
                if not _p.get("id"):
                    _p["id"] = int(time.time() * 1000) + _i
            vd["_migrated_v2"] = True
            save_data(self)
        return vd.setdefault("plans", [])

    def _open_self_dev_window(self):
        """Business Plan Notes — an unlimited list of opportunity cards.

        Replaces a fixed 2x3 grid of large empty text areas. That layout
        capped the user at six ideas, gave every one of them the same
        weight, and answered none of the questions you actually open this
        screen to ask: what is it, why is it an opportunity, what's next,
        how important, when. Each of those is now a field you can see
        without opening anything."""
        win_attr = "_self_dev_win"
        existing = getattr(self, win_attr, None)
        if existing:
            try:
                if existing.winfo_exists():
                    self._bring_window_front(existing)
                    return
            except Exception:
                pass

        pc = _PANEL_COLORS[self._mode]
        BG = pc["note_bg"]
        CARD = pc["card2"]
        FG = pc["input_fg"]
        BORDER = pc["border"]
        HDR_BG = self.T("CARD_BG")
        MUTED = pc["muted"]
        CTRL = pc["ctrl_bg"]
        CTRL_BD = pc["ctrl_bd"]
        ACC = self.T("GREEN")
        night = self._mode in ("warroom", "journey")

        # A planning surface should read as PAPER: one continuous white
        # field with ruled divisions, not cards floating on a grey wash.
        # The grey came from the card-grid era, where every plan needed
        # its own visible tile; the table draws its structure with rules
        # instead, so the tint was doing nothing but dulling the page.
        # Only the light themes change — WAR ROOM and JOURNEY are dark by
        # design and a white sheet would defeat the point of them.
        if not night:
            BG = CARD = "#FFFFFF"
            HDR_BG = "#FFFFFF"
            # Text goes properly black on white. The palette's near-black
            # was tuned against the old grey and reads slightly washed
            # once the ground under it is pure white.
            FG = "#111418"
            MUTED = "#6B7280"
            BORDER = "#E3E6EA"
            CTRL = "#F4F6F8"      # inputs must still be findable on white
            CTRL_BD = "#DCE0E5"

        # This screen's own type scale — every size 3pt above the app's
        # shared constants. Defined locally on purpose: F_XS / F_SMALL /
        # F_H1 are used by every other panel, so bumping them globally
        # would resize the whole app to fix one window.
        BF_XS = (_F, 11)
        BF_SM = (_F, 12)
        BF_SMB = (_F, 12, "bold")
        BF_H1 = (_F, 17, "bold")
        # Project title in the table. Between BF_SMB and BF_H1: big enough
        # to be the unmistakable first stop on a block, small enough that
        # five of them stacked down a page still scan as a list rather
        # than five competing headlines.
        BF_ROW = (_F, 14, "bold")

        # One small accent per status — the only strong colour on a card.
        _SC_LIGHT = {"IDEA": "#5255EF", "OPPORTUNITY": "#117B38",
                     "RESEARCH": "#0891B2", "PLAN": "#A15904",
                     "ACTIVE": "#7C3AED", "HOLD": "#78716C",
                     "DONE": "#64748B"}
        _SC_DARK = {"IDEA": "#818CF8", "OPPORTUNITY": "#4ADE80",
                    "RESEARCH": "#22D3EE", "PLAN": "#FBBF24",
                    "ACTIVE": "#A78BFA", "HOLD": "#A1A1AA",
                    "DONE": "#94A3B8"}
        SC = _SC_DARK if night else _SC_LIGHT
        _PRI_LIGHT = {"HIGH": "#D02222", "MEDIUM": "#A15904", "LOW": "#64748B"}
        _PRI_DARK = {"HIGH": "#F87171", "MEDIUM": "#FBBF24", "LOW": "#94A3B8"}
        PRI = _PRI_DARK if night else _PRI_LIGHT

        def _mix(hex_col, into, amount):
            try:
                _c = hex_col.lstrip("#")
                _b = into.lstrip("#")
                return "#%02X%02X%02X" % tuple(
                    round(int(_c[i:i + 2], 16) * (1 - amount)
                          + int(_b[i:i + 2], 16) * amount)
                    for i in (0, 2, 4))
            except Exception:
                return hex_col

        def _tint(hex_col, amount=0.86):
            """Pale badge background: the status colour blended most of
            the way into the card, so it reads as a tint rather than a
            block of colour. Computed rather than hand-picked — 7
            statuses x 4 themes would be 28 hardcoded values that drift
            out of sync the first time a theme changes."""
            return _mix(hex_col, CARD, amount)

        def _on_tint(hex_col):
            """Text colour for that badge. The raw status hue on its own
            tint measures about 2.4:1 on the three light themes — well
            under the 4.5:1 WCAG AA floor — so on those it is darkened
            40% toward black, which lifts the worst case to 5.0:1. The
            dark theme's brighter palette already clears AA untouched."""
            return hex_col if night else _mix(hex_col, "#000000", 0.40)

        plans = self._bdp_load()
        vd = self.vision_data["self_dev"]
        main_title = vd.get("title", "BUSINESS PLAN NOTES")

        # "grid" was the old card wall. Anything still carrying it (a
        # settings file written before the table view existed) is read as
        # the table, so the saved preference doesn't select a view that is
        # no longer built.
        _saved_view = vd.get("view", "table")
        state = {"q": "", "view": "list" if _saved_view == "list" else "table",
                 "f_status": "All", "f_pri": "All", "f_market": "All",
                 "sort": vd.get("sort", "manual"),
                 "cols": 3}

        def _save():
            save_data(self)

        # ── Manual ordering ───────────────────────────────────────────────────
        # Dragging a project up or down and having it stay put needs a
        # number stored per plan; list position alone is not enough,
        # because the list is re-filtered and re-sorted on every render.
        # Existing plans have no such number, so they are seeded ONCE from
        # the priority ranking — i.e. the order already on screen, which
        # means turning drag on never rearranges anything by surprise.
        def _seed_order():
            if any("order" in p for p in plans):
                return
            for i, p in enumerate(sorted(plans, key=_rank)):
                p["order"] = i
            _save()

        def _order_of(p):
            """Plans created before manual order arrived sort to the end
            rather than all colliding at position 0."""
            try:
                return float(p.get("order", 1e9))
            except (TypeError, ValueError):
                return 1e9

        def _renumber(seq):
            for i, p in enumerate(seq):
                p["order"] = i

        # ── Window ────────────────────────────────────────────────────────────
        win = tk.Toplevel(self)
        setattr(self, win_attr, win)
        win.title(main_title)
        win.configure(bg=BG)
        self._setup_window(win, "self_dev", "1340x880+30+30")

        # ── Header ────────────────────────────────────────────────────────────
        hdr_bar = tk.Frame(win, bg=HDR_BG)
        hdr_bar.pack(fill="x")
        hdr_in = tk.Frame(hdr_bar, bg=HDR_BG, padx=SP4, pady=SP3)
        hdr_in.pack(fill="x")

        # The right-hand controls are packed FIRST so they reserve their
        # width; the title block then takes everything left over. Packed
        # the other way round, the title kept only its requested 24
        # characters and a longer name — "BUSINESS DEVELOPMENT PLAN" —
        # was clipped mid-word with empty space sitting beside it.
        _hr = tk.Frame(hdr_in, bg=HDR_BG)
        _hr.pack(side="right")

        _hl = tk.Frame(hdr_in, bg=HDR_BG)
        _hl.pack(side="left", fill="x", expand=True)
        title_var = tk.StringVar(value=main_title)
        title_e = tk.Entry(_hl, textvariable=title_var, bg=HDR_BG, fg=FG,
                           insertbackground=FG, relief="flat", bd=0,
                           font=(_F, 18, "bold"), highlightthickness=0)
        title_e.pack(fill="x")
        tk.Label(_hl, text="Ideas  ·  Opportunities  ·  Plans", bg=HDR_BG,
                 fg=MUTED, font=BF_XS, anchor="w").pack(fill="x")

        def _save_main_title(e=None):
            t = title_var.get().strip() or "BUSINESS PLAN NOTES"
            vd["title"] = t
            win.title(t)
            _save()
        title_e.bind("<FocusOut>", _save_main_title)
        title_e.bind("<KeyRelease>", _save_main_title)

        def _hbtn(parent, text, cmd, primary=False):
            b = tk.Button(parent, text=text, command=cmd,
                          bg=ACC if primary else CTRL,
                          fg=_ink(ACC) if primary else FG,
                          font=BF_SMB, relief="flat", bd=0, cursor="hand2",
                          padx=SP3, pady=SP1,
                          highlightthickness=0 if primary else 1,
                          highlightbackground=CTRL_BD,
                          activebackground=self.T("GREEN2") if primary
                          else pc["active_btn"],
                          activeforeground=_ink(ACC) if primary else FG)
            b.pack(side="left", padx=(SP1, 0))
            _hover(b, ACC if primary else CTRL,
                   self.T("GREEN2") if primary else pc["active_btn"],
                   "#FFFFFF" if primary else FG,
                   "#FFFFFF" if primary else FG)
            self._press_depth(b)
            return b

        # Search — filters as you type, no submit button.
        _sw = tk.Frame(_hr, bg=CTRL, highlightthickness=1,
                       highlightbackground=CTRL_BD)
        _sw.pack(side="left", padx=(0, SP2))
        # ⌕ not 🔍 — same reason as the search box on the tasks screen:
        # the emoji is a fixed multi-colour bitmap that ignores the theme.
        tk.Label(_sw, text="⌕", bg=CTRL, fg=MUTED, font=BF_SMB
                 ).pack(side="left", padx=(SP2, 0))
        q_var = tk.StringVar()
        q_e = tk.Entry(_sw, textvariable=q_var, bg=CTRL, fg=FG, width=22,
                       relief="flat", bd=0, font=BF_SM,
                       insertbackground=FG, highlightthickness=0)
        q_e.pack(side="left", ipady=3, padx=(4, SP2))

        def _on_q(e=None):
            state["q"] = q_var.get().strip().lower()
            _render()
        q_e.bind("<KeyRelease>", _on_q)
        q_e.bind("<Escape>", lambda e: (q_var.set(""), _on_q()))

        view_btn = _hbtn(_hr, "", lambda: _toggle_view())
        sort_btn = _hbtn(_hr, "", lambda: _toggle_sort())
        filter_btn = _hbtn(_hr, "⚗  Filter", lambda: _open_filter())
        _hbtn(_hr, "⚡  Quick", lambda: _plan_modal(quick=True))
        _hbtn(_hr, "+  New Plan", lambda: _plan_modal(), primary=True)

        def _paint_view_btn():
            view_btn.config(text="▤  List" if state["view"] == "table"
                            else "▦  Table")

        def _toggle_view():
            state["view"] = "list" if state["view"] == "table" else "table"
            vd["view"] = state["view"]
            _paint_view_btn()
            _save()
            _render()
        _paint_view_btn()

        def _paint_sort_btn():
            # The button names the CURRENT mode, not the one it switches
            # to — you need to know how the list in front of you is
            # ordered before you need to know how to change it.
            sort_btn.config(text="⇅  Manual" if state["sort"] == "manual"
                            else "⇅  Priority")

        def _toggle_sort():
            state["sort"] = ("priority" if state["sort"] == "manual"
                             else "manual")
            vd["sort"] = state["sort"]
            _paint_sort_btn()
            _save()
            _render()
        _paint_sort_btn()

        tk.Frame(win, bg=BORDER, height=1).pack(fill="x")

        # Active-filter summary line, only when something is filtering.
        chip_bar = tk.Frame(win, bg=BG)
        chip_bar.pack(fill="x")

        # ── Scrollable card area ──────────────────────────────────────────────
        # NOTE: wrap is packed LAST (just before _render), not here. It is
        # the expand=True region, and in Tk whatever claims expansion
        # first takes the leftover space — packing it before the bottom
        # status bar would squeeze that bar to zero height.
        wrap = tk.Frame(win, bg=BG)
        cv = tk.Canvas(wrap, bg=BG, highlightthickness=0)
        sb = tk.Scrollbar(wrap, orient="vertical", command=cv.yview)
        _style_sb(sb, BG, _blend(BG, self.T("TEXT3"), 0.5))
        sb.pack(side="right", fill="y")
        cv.pack(side="left", fill="both", expand=True)
        cv.configure(yscrollcommand=sb.set)
        body = tk.Frame(cv, bg=BG)
        _wid = cv.create_window((0, 0), window=body, anchor="nw")
        body.bind("<Configure>",
                  lambda e: cv.configure(scrollregion=cv.bbox("all")))

        def _on_cv_resize(e):
            # The table's three columns are weight-based, so they follow
            # the window on their own — no rebuild on resize. (The card
            # grid this replaced had to re-render to change its column
            # count; dragging the window edge rebuilt every card.)
            cv.itemconfig(_wid, width=e.width)
        cv.bind("<Configure>", _on_cv_resize)

        def _wheel(e):
            try:
                cv.yview_scroll(int(-1 * (e.delta / 120)), "units")
            except Exception:
                pass
        cv.bind("<MouseWheel>", _wheel)
        win.bind("<MouseWheel>", _wheel)

        status_lbl = tk.Label(win, text="", bg=HDR_BG, fg=MUTED, font=BF_XS,
                              anchor="w", padx=SP4)

        # ── Filtering ─────────────────────────────────────────────────────────
        def _visible():
            out = []
            for p in plans:
                if p.get("archived"):
                    continue
                if state["f_status"] != "All" and p.get("status") != state["f_status"]:
                    continue
                if state["f_pri"] != "All" and p.get("priority") != state["f_pri"]:
                    continue
                if state["f_market"] != "All":
                    if state["f_market"] == "Other":
                        if (p.get("market") or "") in ("Bangladesh", "USA",
                                                       "Global", ""):
                            continue
                    elif (p.get("market") or "") != state["f_market"]:
                        continue
                if state["q"]:
                    hay = " ".join(str(p.get(k, "")) for k in (
                        "title", "opportunity", "market", "target", "niche",
                        "model", "product", "service", "supplier",
                        "notes")).lower()
                    hay += " " + " ".join(a.get("text", "")
                                          for a in p.get("next_actions", [])).lower()
                    if state["q"] not in hay:
                        continue
                out.append(p)
            if state["sort"] == "priority":
                return sorted(out, key=_rank)
            return sorted(out, key=_order_of)

        def _rank(p):
            """Serial order = what deserves attention first.

            HIGH before MEDIUM before LOW; inside a priority the higher
            potential wins; and where those tie, the plan that has been
            sitting around longest comes first — an idea logged 90 days
            ago and still untouched is the one at risk of quietly dying.
            The whole point of the table view is that reading top to
            bottom IS the priority order, so this cannot be left to
            insertion order.
            """
            _pri = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
            try:
                _pot = int(p.get("potential") or 0)
            except Exception:
                _pot = 0
            _created = p.get("created") or p.get("updated") or ""
            return (_pri.get(p.get("priority", "MEDIUM"), 1), -_pot, _created)

        def _open_filter():
            m = tk.Toplevel(win)
            m.wm_overrideredirect(True)
            m.configure(bg=CTRL_BD)
            filter_btn.update_idletasks()
            _x = filter_btn.winfo_rootx()
            _y = filter_btn.winfo_rooty() + filter_btn.winfo_height() + 2
            inner = tk.Frame(m, bg=pc["menu_bg"], padx=SP3, pady=SP3)
            inner.pack(padx=1, pady=1)

            def _grp(label, key, opts):
                tk.Label(inner, text=label, bg=pc["menu_bg"], fg=MUTED,
                         font=BF_XS, anchor="w").pack(fill="x", pady=(SP2, 2))
                rowf = tk.Frame(inner, bg=pc["menu_bg"])
                rowf.pack(fill="x")
                for o in opts:
                    on = state[key] == o
                    b = tk.Button(rowf, text=o, font=BF_XS, relief="flat",
                                  bd=0, cursor="hand2", padx=SP2, pady=1,
                                  bg=ACC if on else CTRL,
                                  fg=_ink(ACC) if on else FG,
                                  activebackground=pc["active_btn"])

                    def _pick(k=key, v=o, mm=m):
                        state[k] = v
                        mm.destroy()
                        _render()
                    b.config(command=_pick)
                    b.pack(side="left", padx=(0, 3), pady=1)
            _grp("STATUS", "f_status", ("All",) + self._BDP_STATUSES)
            _grp("PRIORITY", "f_pri", ("All",) + self._BDP_PRIORITIES)
            _grp("MARKET", "f_market",
                 ("All", "Bangladesh", "USA", "Global", "Other"))

            def _clear(mm=m):
                state.update(f_status="All", f_pri="All", f_market="All")
                mm.destroy()
                _render()
            tk.Button(inner, text="Clear all filters", command=_clear,
                      bg=pc["menu_bg"], fg=ACC, font=BF_XS, relief="flat",
                      bd=0, cursor="hand2", activebackground=pc["menu_hover"]
                      ).pack(fill="x", pady=(SP3, 0))
            m.update_idletasks()
            m.geometry(f"+{max(_x + filter_btn.winfo_width() - m.winfo_reqwidth(), 0)}+{_y}")
            m.lift()
            m.bind("<FocusOut>", lambda e: self.after(
                120, lambda: m.winfo_exists() and m.destroy()))
            m.bind("<Escape>", lambda e: m.destroy())
            m.focus_set()

        # ── Editor / quick-capture modal ──────────────────────────────────────
        def _plan_modal(plan=None, quick=False):
            """One modal for three jobs: new, edit, and 15-second capture.
            Quick mode shows four fields — anything more and an idea gets
            lost while you're still filling in the form."""
            new = plan is None
            p = plan or {"id": int(time.time() * 1000), "status": "IDEA",
                         "priority": "MEDIUM", "next_actions": [],
                         "potential": 3, "difficulty": 3, "investment": 2,
                         "archived": False}
            m = tk.Toplevel(win)
            m.title("Quick opportunity" if quick
                    else ("New plan" if new else "Edit plan"))
            m.configure(bg=CARD)
            m.transient(win)
            try:
                m.grab_set()
            except Exception:
                pass
            # The full editor is taller than most screens, and it used to
            # be one plain frame sized to its contents — so Save and
            # Cancel ended up below the bottom of the display and the
            # window had to be dragged upward to reach them. The action
            # bar is now pinned to the bottom (packed first, so it can
            # never be squeezed out) and the fields scroll behind it.
            act_bar = tk.Frame(m, bg=CARD, padx=SP4, pady=SP3)
            act_bar.pack(side="bottom", fill="x")
            tk.Frame(m, bg=BORDER, height=1).pack(side="bottom", fill="x")

            _msc = tk.Frame(m, bg=CARD)
            _msc.pack(fill="both", expand=True)
            _mcv = tk.Canvas(_msc, bg=CARD, highlightthickness=0)
            _msb = tk.Scrollbar(_msc, orient="vertical", command=_mcv.yview)
            _style_sb(_msb, CARD, _blend(CARD, self.T("TEXT3"), 0.5))
            _msb.pack(side="right", fill="y")
            _mcv.pack(side="left", fill="both", expand=True)
            _mcv.configure(yscrollcommand=_msb.set)
            frm = tk.Frame(_mcv, bg=CARD, padx=SP4, pady=SP4)
            _mfid = _mcv.create_window((0, 0), window=frm, anchor="nw")
            frm.bind("<Configure>",
                     lambda e: _mcv.configure(scrollregion=_mcv.bbox("all")))
            _mcv.bind("<Configure>",
                      lambda e: _mcv.itemconfig(_mfid, width=e.width))
            _mcv.bind("<MouseWheel>", lambda e: _mcv.yview_scroll(
                int(-1 * (e.delta / 120)), "units"))
            m.bind("<MouseWheel>", lambda e: _mcv.yview_scroll(
                int(-1 * (e.delta / 120)), "units"))
            frm.columnconfigure(1, weight=1)
            r = {"i": 0}
            V = {}

            def _sect(label):
                """Small caps divider. Twenty stacked label/field pairs
                with identical weight is a wall; three named groups is a
                form you can skim."""
                tk.Label(frm, text=label, bg=CARD, fg=ACC, font=BF_XS,
                         anchor="w").grid(row=r["i"], column=0, columnspan=2,
                                          sticky="w", pady=(SP4, 2))
                r["i"] += 1
                tk.Frame(frm, bg=BORDER, height=1).grid(
                    row=r["i"], column=0, columnspan=2, sticky="ew",
                    pady=(0, SP2))
                r["i"] += 1

            def _fld(label, key, height=1, width=34, hint=""):
                tk.Label(frm, text=label, bg=CARD, fg=MUTED, font=BF_SM,
                         anchor="w").grid(row=r["i"], column=0, sticky="nw",
                                          padx=(0, SP4), pady=(8, 2))
                if height > 1:
                    t = tk.Text(frm, bg=CTRL, fg=FG, font=BF_SM, width=width,
                                height=height, relief="flat", wrap="word",
                                insertbackground=ACC, highlightthickness=1,
                                highlightbackground=CTRL_BD,
                                highlightcolor=ACC, padx=SP3, pady=SP2,
                                spacing1=2, spacing3=2)
                    t.insert("1.0", p.get(key, ""))
                    t.grid(row=r["i"], column=1, sticky="ew", pady=(8, 2))
                    V[key] = ("text", t)
                else:
                    v = tk.StringVar(value=str(p.get(key, "")))
                    e = tk.Entry(frm, textvariable=v, bg=CTRL, fg=FG,
                                 font=BF_SM, width=width, relief="flat",
                                 insertbackground=ACC, highlightthickness=1,
                                 highlightbackground=CTRL_BD,
                                 highlightcolor=ACC)
                    e.grid(row=r["i"], column=1, sticky="ew", pady=(8, 2),
                           ipady=5, ipadx=SP2)
                    V[key] = ("entry", v)
                if hint:
                    r["i"] += 1
                    tk.Label(frm, text=hint, bg=CARD, fg=MUTED, font=BF_XS,
                             anchor="w").grid(row=r["i"], column=1, sticky="w")
                r["i"] += 1

            def _choice(label, key, opts):
                tk.Label(frm, text=label, bg=CARD, fg=MUTED, font=BF_XS,
                         anchor="w").grid(row=r["i"], column=0, sticky="w",
                                          padx=(0, SP3), pady=4)
                holder = tk.Frame(frm, bg=CARD)
                holder.grid(row=r["i"], column=1, sticky="w", pady=4)
                sel = {"v": p.get(key, opts[0])}
                btns = {}

                # The selected chip takes the colour of the thing it
                # names — the status's own hue, the priority's own hue —
                # instead of the theme accent. On ENERGY the accent is a
                # hot red, so "OPPORTUNITY" and "MEDIUM" both lit up
                # alarm-red while meaning neither urgency nor error.
                def _chip_col(o):
                    return SC.get(o) or PRI.get(o) or ACC

                def _paint():
                    for o, b in btns.items():
                        on = sel["v"] == o
                        b.config(bg=_chip_col(o) if on else CTRL,
                                 fg=_ink(_chip_col(o)) if on else MUTED,
                                 activebackground=_chip_col(o) if on
                                 else pc["active_btn"])
                for o in opts:
                    b = tk.Button(holder, text=o, font=BF_XS, relief="flat",
                                  bd=0, cursor="hand2", padx=SP3, pady=3,
                                  highlightthickness=0)

                    def _set(o=o):
                        sel["v"] = o
                        _paint()
                    b.config(command=_set)
                    b.pack(side="left", padx=(0, 4))
                    btns[o] = b
                _paint()
                V[key] = ("choice", sel)
                r["i"] += 1

            def _rating(label, key, mx=5, sym="★"):
                tk.Label(frm, text=label, bg=CARD, fg=MUTED, font=BF_XS,
                         anchor="w").grid(row=r["i"], column=0, sticky="w",
                                          padx=(0, SP3), pady=4)
                holder = tk.Frame(frm, bg=CARD)
                holder.grid(row=r["i"], column=1, sticky="w", pady=4)
                sel = {"v": int(p.get(key, 3) or 3)}
                lb = tk.Label(holder, bg=CARD, fg=ACC, font=BF_SMB)
                lb.pack(side="left")

                def _paint():
                    lb.config(text=sym * sel["v"] + "·" * (mx - sel["v"]))
                for d, tx in ((-1, "−"), (1, "+")):
                    def _bump(d=d):
                        sel["v"] = max(1, min(mx, sel["v"] + d))
                        _paint()
                    tk.Button(holder, text=tx, command=_bump, font=BF_XS,
                              bg=CTRL, fg=FG, relief="flat", bd=0, width=2,
                              cursor="hand2", activebackground=pc["active_btn"]
                              ).pack(side="left", padx=(SP2, 0))
                _paint()
                V[key] = ("num", sel)
                r["i"] += 1

            _sect("THE IDEA")
            _fld("Business name *", "title")
            _fld("Opportunity *", "opportunity", height=3,
                 hint="Why is this worth your time?")
            if quick:
                _fld("First next action", "_quick_action")
                _choice("Priority", "priority", self._BDP_PRIORITIES)
            else:
                _choice("Status", "status", self._BDP_STATUSES)
                _choice("Priority", "priority", self._BDP_PRIORITIES)
                _sect("WHO AND WHERE")
                _fld("Market", "market")
                _fld("Target customer", "target")
                _fld("Niche", "niche")
                _fld("Business model", "model")
                _fld("Product", "product")
                _fld("Service", "service")
                _fld("Supplier", "supplier",
                     hint="Name, page or link — shown in the table view")
                _sect("PLAN")
                _fld("Timeline", "timeline", hint="e.g. 3 Months")
                _fld("Next actions", "_actions_txt", height=4,
                     hint="One per line. Ticked items keep their tick.")
                _sect("WORTH IT?")
                _rating("Potential", "potential")
                _rating("Difficulty", "difficulty")
                _fld("Investment (৳)", "cost_amount",
                     hint="Total investment needed, in Taka")
                _fld("Yearly profit (৳)", "yearly_profit",
                     hint="Expected profit per year, in Taka")
                _fld("Notes", "notes", height=3)
                # Prefill the actions box from the structured list.
                _, _at = V["_actions_txt"]
                _at.delete("1.0", "end")
                _at.insert("1.0", "\n".join(a.get("text", "")
                                            for a in p.get("next_actions", [])))

            # Validation message is created down in act_bar, not here —
            # an error inside the scrolling area is invisible whenever the
            # user is scrolled past it, which is precisely when they've
            # just pressed Save at the bottom.

            def _get(key):
                kind, obj = V[key]
                if kind == "text":
                    return obj.get("1.0", "end-1c").strip()
                if kind == "entry":
                    return obj.get().strip()
                return obj["v"]

            def _commit():
                title = _get("title")
                opp = _get("opportunity")
                if not title:
                    err.config(text="⚠  A business name is required.",
                               fg=self.T("RED"))
                    _mcv.yview_moveto(0)   # scroll back to the empty field
                    return
                p["title"] = title
                p["opportunity"] = opp
                p["priority"] = _get("priority")
                if quick:
                    p.setdefault("status", "IDEA")
                    _a = _get("_quick_action")
                    if _a:
                        p["next_actions"] = [{"text": _a, "done": False}]
                    for _k in ("market", "target", "niche", "model",
                               "product", "service", "supplier", "timeline",
                               "notes"):
                        p.setdefault(_k, "")
                else:
                    for _k in ("status", "market", "target", "niche", "model",
                               "product", "service", "supplier", "timeline",
                               "notes"):
                        p[_k] = _get(_k)
                    for _k in ("potential", "difficulty",
                               "cost_amount", "yearly_profit"):
                        p[_k] = _get(_k)
                    # Re-tick surviving actions by text, so editing the
                    # list doesn't silently un-complete finished work.
                    _was = {a.get("text"): a.get("done", False)
                            for a in p.get("next_actions", [])}
                    p["next_actions"] = [
                        {"text": ln.strip(), "done": _was.get(ln.strip(), False)}
                        for ln in _get("_actions_txt").splitlines()
                        if ln.strip()]
                p["updated"] = str(date.today())
                if new:
                    p.setdefault("created", str(date.today()))
                    # A new plan goes to the TOP of the manual order — it
                    # is the thing you just decided was worth capturing,
                    # so burying it under everything older would be wrong.
                    p["order"] = min([_order_of(q) for q in plans],
                                     default=0.0) - 1.0
                    plans.insert(0, p)
                _save()
                m.destroy()
                _render()
            # Buttons live in act_bar, not in the scrolling field grid, so
            # they stay on screen no matter how long the form gets.
            _sb2 = tk.Button(act_bar, text="Save  ✓", command=_commit, bg=ACC,
                             fg="#FFFFFF", font=BF_SMB, relief="flat",
                             bd=0, cursor="hand2", padx=SP5, pady=SP2,
                             activebackground=self.T("GREEN2"),
                             activeforeground="#FFFFFF")
            _sb2.pack(side="right")
            self._press_depth(_sb2)
            _cb2 = tk.Button(act_bar, text="Cancel", command=m.destroy,
                             bg=CARD, fg=MUTED, font=BF_SM, relief="flat",
                             bd=0, cursor="hand2", padx=SP3, pady=SP2,
                             activebackground=CARD, activeforeground=FG)
            _cb2.pack(side="right", padx=(0, SP2))
            _hover(_cb2, CARD, pc["active_btn"], MUTED, FG)
            # One label, two jobs: the keyboard hint normally, the
            # validation message when Save is refused.
            _HINT = "Ctrl+Enter saves  ·  Esc cancels"
            err = tk.Label(act_bar, text=_HINT, bg=CARD, fg=MUTED,
                           font=BF_XS, anchor="w")
            err.pack(side="left")

            m.bind("<Escape>", lambda e: m.destroy())
            m.bind("<Control-Return>", lambda e: _commit())

            # Size to content, but never taller than the screen's work
            # area — that overflow is exactly what pushed Save off-screen.
            m.update_idletasks()
            _need_h = (frm.winfo_reqheight() + act_bar.winfo_reqheight()
                       + SP5)
            _need_w = max(frm.winfo_reqwidth() + SP5, 560)
            _l, _t, _rt, _b = self._work_area()
            _max_h = max(320, (_b - _t) - 80)
            _h = min(_need_h, _max_h)
            _mx = win.winfo_rootx() + (win.winfo_width() - _need_w) // 2
            _my = _t + max((_b - _t - _h) // 2, 20)
            m.geometry(f"{_need_w}x{_h}+{max(_mx, _l + 10)}+{_my}")
            m.minsize(480, 320)

        # ── Row actions ───────────────────────────────────────────────────────
        def _card_menu(p, anchor):
            m = tk.Toplevel(win)
            m.wm_overrideredirect(True)
            m.configure(bg=CTRL_BD)
            inner = tk.Frame(m, bg=pc["menu_bg"])
            inner.pack(padx=1, pady=1)

            def _dup():
                import copy as _cp
                q = _cp.deepcopy(p)
                q["id"] = int(time.time() * 1000)
                q["title"] = p.get("title", "") + " (copy)"
                plans.insert(plans.index(p) + 1, q)
                _save()
                _render()

            def _arch():
                p["archived"] = True
                _save()
                _render()

            def _del():
                from tkinter import messagebox
                if messagebox.askyesno(
                        "Delete plan",
                        f"Delete “{p.get('title', '')}” permanently?",
                        parent=win):
                    plans.remove(p)
                    _save()
                    _render()
            for _t, _c in (("Edit", lambda: _plan_modal(p)),
                           ("Duplicate", _dup),
                           ("Archive", _arch),
                           ("Delete", _del)):
                b = tk.Button(inner, text=_t, font=BF_SM, relief="flat",
                              bd=0, cursor="hand2", anchor="w", padx=SP3,
                              pady=SP1, bg=pc["menu_bg"], fg=pc["menu_fg"],
                              activebackground=pc["menu_hover"],
                              command=lambda c=_c, mm=m: (mm.destroy(), c()))
                b.pack(fill="x")
                _hover(b, pc["menu_bg"], pc["menu_hover"])
            m.update_idletasks()
            anchor.update_idletasks()
            _x = anchor.winfo_rootx() + anchor.winfo_width() - m.winfo_reqwidth()
            m.geometry(f"+{max(_x, 0)}+{anchor.winfo_rooty() + anchor.winfo_height() + 2}")
            m.lift()
            m.bind("<FocusOut>", lambda e: self.after(
                120, lambda: m.winfo_exists() and m.destroy()))
            m.bind("<Escape>", lambda e: m.destroy())
            m.focus_set()

        # ── Landscape table view ──────────────────────────────────────────────
        # Three columns across a wide page, one heavy-ruled block per
        # project, read top to bottom in priority order. The card grid it
        # replaces answered "what is this plan?" one card at a time; this
        # answers "which of these matters right now?" in a single glance,
        # which is the actual job of a business development plan.
        # The left column carries every figure you compare plans on, so it
        # earns the room. Supplier is usually one link and Market is one
        # short line; Roadmap is empty until actions are written. At the
        # first proportions (46/30/24) more than half the page was blank
        # while the numbers were crammed into a narrow strip.
        _TBL_COLS = ((0, "PROJECT NAME", 56),
                     (1, "SUPPLIER", 24),
                     (2, "ROADMAP", 20))

        #: Width of the label gutter in the left column, in characters.
        #: Every label row uses this one number so the values line up in a
        #: straight edge down the block. It must clear the LONGEST label
        #: ("COST / RETURN" and "UPSIDE/EFFORT", 13 each) — at 12 the tk
        #: Label simply clipped, which printed "UPSIDE/EFFOR" and ran the
        #: ৳ figure straight into the end of "RETURN".
        _KV_W = 15

        #: Rule weights. The header gets the heavy black rule that anchors
        #: the page; the divisions BETWEEN projects are a quiet grey. Using
        #: full black for both — which is what the first version did —
        #: turns a white sheet into a ledger, and every project shouts as
        #: loudly as the header does.
        _RULE_STRONG = FG
        _RULE_SOFT = _mix(FG, BG, 0.80) if not night else BORDER

        #: Row hover. Barely there on purpose — enough to confirm which
        #: project the pointer is on, not enough to compete with the
        #: status accent or make the page twitch as the mouse crosses it.
        _HOVER = _mix(ACC, CARD, 0.94)

        def _tbl_header(parent):
            hdr = tk.Frame(parent, bg=BG)
            hdr.pack(fill="x")
            # 2px rules above and below the header, 1px between blocks —
            # the weight difference is what makes the header read as a
            # header without needing a fill colour behind it.
            tk.Frame(hdr, bg=_RULE_STRONG, height=2).pack(fill="x")
            row = tk.Frame(hdr, bg=BG)
            row.pack(fill="x")
            for ci, label, weight in _TBL_COLS:
                row.columnconfigure(ci, weight=weight, uniform="bdptbl")
                cell = tk.Frame(row, bg=BG)
                cell.grid(row=0, column=ci, sticky="nsew")
                # Muted, not full-strength: a column header is read once
                # to learn the layout and should never again compete with
                # the project titles underneath it.
                tk.Label(cell, text=label, bg=BG, fg=MUTED, font=BF_XS,
                         anchor="w", padx=SP3, pady=SP1).pack(fill="x")
                if ci:
                    tk.Frame(row, bg=BORDER, width=1).grid(
                        row=0, column=ci, sticky="nsw")
            tk.Frame(hdr, bg=_RULE_STRONG, height=2).pack(fill="x")
            return hdr

        # ── Drag to reorder ───────────────────────────────────────────────────
        # Tk has no drag-and-drop, so this is built from the three mouse
        # events. The dragged block is not moved on screen — instead the
        # row it would land on is highlighted, and the list is rebuilt on
        # release. Reordering widgets live inside a scrolling canvas
        # fights the scroll position and flickers; a single rebuild at the
        # end does not, and the drop indicator is enough feedback.
        _drag = {"plan": None, "row": None, "targets": [], "mark": None,
                 "moved": False, "y0": 0}

        def _drag_targets_rebuild(seq):
            _drag["targets"] = seq        # (widget, plan) pairs, in order

        def _drag_start(p, widget, e=None):
            # Recorded even in Priority sort, because the press still has
            # to be able to become a click that opens the project.
            _drag.update(plan=p, row=widget, moved=False,
                         y0=(e.y_root if e is not None else 0))

        def _drag_motion(e):
            if _drag["plan"] is None or state["sort"] != "manual":
                return
            # A few pixels of slop before a press counts as a drag —
            # without it, the tiny mouse shift during an ordinary click
            # would register as a reorder and the project would never open.
            if abs(e.y_root - _drag["y0"]) > 4:
                _drag["moved"] = True
            if not _drag["moved"]:
                return
            y = e.widget.winfo_rooty() + e.y
            hit = None
            for w, q in _drag["targets"]:
                try:
                    top = w.winfo_rooty()
                    if top <= y <= top + w.winfo_height():
                        hit = (w, q)
                        break
                except tk.TclError:
                    continue
            def _paint(target, colour):
                fn = getattr(target[0], "_bdp_wash", None)
                try:
                    if fn is not None:
                        fn(colour)
                    else:
                        target[0].config(bg=colour)
                except tk.TclError:
                    pass
            if _drag["mark"] is not None and _drag["mark"] is not hit:
                _paint(_drag["mark"], CARD)
            if hit is not None and hit[1] is not _drag["plan"]:
                _paint(hit, _mix(ACC, CARD, 0.80))
                _drag["mark"] = hit
            else:
                _drag["mark"] = None

        def _drag_drop(e):
            src = _drag["plan"]
            mark = _drag["mark"]
            moved = _drag["moved"]
            _drag.update(plan=None, row=None, mark=None, moved=False)
            if src is None:
                return
            if mark is None:
                # Pressed and released without dragging onto another row —
                # that is a click, and a click opens the project. Doing
                # this on RELEASE rather than on press is what lets the
                # same gesture serve both: you only know it was a click
                # once the button comes up without having moved.
                if not moved:
                    _open_plan_page(src)
                else:
                    _render()
                return
            dst = mark[1]
            seq = [q for _w, q in _drag["targets"]]
            if src not in seq or dst not in seq:
                _render()
                return
            seq.remove(src)
            seq.insert(seq.index(dst) if seq else 0, src)
            # Renumber the WHOLE visible sequence, not just the two rows.
            # Nudging a single value works until a filter hides the plans
            # in between and two orders collide.
            _renumber(seq)
            _save()
            _render()

        def _drag_bind(widget, p):
            """Whole-row drag handle. Bound on the block and its children
            so a press anywhere on the row starts a drag, not only on the
            few pixels of bare frame between labels."""
            widget.bind("<Button-1>", lambda e, pp=p, w=widget:
                        _drag_start(pp, w, e), add="+")
            widget.bind("<B1-Motion>", _drag_motion, add="+")
            widget.bind("<ButtonRelease-1>", _drag_drop, add="+")

        def _tbl_kv(parent, label, value, val_col=None, bold=False,
                    money=False):
            """One 'OPPORTUNITY: …' style line inside the left column.

            Three deliberate weights, not one flat grey. The LABEL is the
            quietest thing on the row — it is a signpost you read once and
            then stop seeing. The VALUE carries full text colour. Money
            gets bold on top, because on a business plan the figure is the
            argument: everything else describes the opportunity, the
            number decides it. Previously every one of these was the same
            muted grey at the same size, which is why the eye had nowhere
            to go after the title.
            """
            line = tk.Frame(parent, bg=CARD)
            line.pack(fill="x", pady=1)
            tk.Label(line, text=label, bg=CARD, fg=MUTED, font=BF_XS,
                     anchor="w", width=_KV_W).pack(side="left")
            lb = tk.Label(line, text=value, bg=CARD,
                          fg=val_col or FG,
                          font=BF_SMB if (bold or money) else BF_SM,
                          anchor="w", justify="left")
            lb.pack(side="left", fill="x", expand=True)
            return lb

        def _build_table_block(parent, p, idx):
            acc = SC.get(p.get("status", "IDEA"), ACC)
            _pr = p.get("priority", "MEDIUM")

            block = tk.Frame(parent, bg=CARD)
            block.pack(fill="x")
            row = tk.Frame(block, bg=CARD)
            row.pack(fill="x")
            for ci, _lbl, weight in _TBL_COLS:
                row.columnconfigure(ci, weight=weight, uniform="bdptbl")

            _wrappers = []

            def _fit(e):
                # Each column wraps to its own share of the real width.
                for _lb, _share in _wrappers:
                    try:
                        _lb.config(wraplength=max(
                            int(e.width * _share) - SP4 * 2, 110))
                    except Exception:
                        pass
            row.bind("<Configure>", _fit)

            # ── column 1: the project and its numbers ──────────────────
            c1 = tk.Frame(row, bg=CARD, padx=SP3, pady=SP2)
            c1.grid(row=0, column=0, sticky="nsew")

            head = tk.Frame(c1, bg=CARD)
            head.pack(fill="x")
            # Serial number carries the priority colour, so the ranking is
            # legible before a single word is read.
            tk.Label(head, text=f"{idx}.", bg=CARD, fg=PRI.get(_pr, MUTED),
                     font=BF_ROW, anchor="w").pack(side="left", padx=(0, SP2))
            _ttl = tk.Label(head, text=p.get("title", ""), bg=CARD, fg=FG,
                            font=BF_ROW, anchor="w", justify="left")
            _ttl.pack(side="left", fill="x", expand=True)
            _wrappers.append((_ttl, 0.46))

            opp = (p.get("opportunity") or "").strip()
            if opp:
                _o = _tbl_kv(c1, "OPPORTUNITY", opp, _on_tint(acc), bold=True)
                _wrappers.append((_o, 0.34))

            try:
                _cost = int(float(p.get("cost_amount") or 0))
            except Exception:
                _cost = 0
            try:
                _prof = int(float(p.get("yearly_profit") or 0))
            except Exception:
                _prof = 0
            _POT_C = (self.T("DONE_GREEN") if night
                      else _mix(self.T("DONE_GREEN"), "#000000", 0.25))
            # Investment and Profit belong on ONE line: they are read as a
            # pair (what it costs against what it returns), and stacking
            # them cost a whole row of height each. Rows with nothing in
            # them are skipped outright rather than printed as "—" — a
            # column of dashes is noise that pushes the next project off
            # the screen without telling you anything.
            if _cost or _prof:
                _mr = tk.Frame(c1, bg=CARD)
                _mr.pack(fill="x", pady=1)
                tk.Label(_mr, text="COST / RETURN", bg=CARD, fg=MUTED,
                         font=BF_XS, anchor="w", width=_KV_W).pack(side="left")
                tk.Label(_mr, text=f"৳{_cost:,}" if _cost else "—",
                         bg=CARD, fg=FG, font=BF_SMB).pack(side="left")
                tk.Label(_mr, text="  →  ", bg=CARD, fg=MUTED,
                         font=BF_XS).pack(side="left")
                tk.Label(_mr, text=f"৳{_prof:,}/yr" if _prof else "—",
                         bg=CARD, fg=_POT_C if _prof else MUTED,
                         font=BF_SMB).pack(side="left")

            # Potential and Difficulty, with the unearned steps drawn as
            # faint hollow stars. They used to be painted in the card's
            # own background colour — technically present, literally
            # invisible — so "★★★" gave no way to tell a 3-of-5 from a
            # 3-of-3. On a screen whose whole purpose is comparing one
            # opportunity against another, a rating without its
            # denominator is worse than no rating at all.
            _DIF_C = (PRI["MEDIUM"] if night
                      else _mix(PRI["MEDIUM"], "#000000", 0.25))
            _EMPTY_C = _mix(MUTED, CARD, 0.45)
            _rates = [(lb, max(0, min(5, int(p.get(k) or 0))), col)
                      for k, lb, col in (("potential", "UPSIDE", _POT_C),
                                         ("difficulty", "EFFORT", _DIF_C))
                      if p.get(k)]
            if _rates:
                # Both scales share one line. Upside against effort IS the
                # comparison — side by side you can read it in a glance;
                # stacked, it was two rows per project and five projects
                # no longer fitted on a screen.
                _rr = tk.Frame(c1, bg=CARD)
                _rr.pack(fill="x", pady=1)
                tk.Label(_rr, text="UPSIDE/EFFORT", bg=CARD, fg=MUTED,
                         font=BF_XS, anchor="w", width=_KV_W).pack(side="left")
                for _i, (_lb, _n, _col) in enumerate(_rates):
                    if _i:
                        tk.Label(_rr, text="   ", bg=CARD,
                                 font=BF_XS).pack(side="left")
                    tk.Label(_rr, text="★" * _n, bg=CARD, fg=_col,
                             font=BF_SMB).pack(side="left")
                    if _n < 5:
                        tk.Label(_rr, text="☆" * (5 - _n), bg=CARD,
                                 fg=_EMPTY_C, font=BF_SMB).pack(side="left")
                    tk.Label(_rr, text=f" {_lb.lower()}", bg=CARD, fg=MUTED,
                             font=BF_XS).pack(side="left")

            # Status, priority and how long it has been sitting — the
            # "is this stalling?" signal, kept to one quiet line.
            _created = p.get("created") or p.get("updated") or str(date.today())
            _stalled = False
            try:
                _days = max(1, (date.today()
                                - date.fromisoformat(_created)).days + 1)
                _age = f"{_days}d running"
                # A plan that has been open a long time with nothing
                # ticked off is not "in progress", it is stuck — and that
                # is the single most useful thing this page can tell you.
                # Sort order alone can't say it: an old idea sinks to the
                # bottom of its priority band and quietly looks fine.
                _acts = p.get("next_actions", [])
                _done_n = sum(1 for a in _acts if a.get("done"))
                _stalled = (_days >= 30 and _done_n == 0
                            and p.get("status") not in ("DONE", "HOLD"))
            except Exception:
                _age = _created
            foot = tk.Frame(c1, bg=CARD)
            foot.pack(fill="x", pady=(SP2, 0))
            _bdg = tk.Frame(foot, bg=_tint(acc))
            _bdg.pack(side="left")
            tk.Label(_bdg, text=p.get("status", "IDEA"), bg=_tint(acc),
                     fg=_on_tint(acc), font=BF_XS, padx=SP2).pack()
            tk.Label(foot, text=f"⚑ {_pr}", bg=CARD, fg=PRI.get(_pr, MUTED),
                     font=BF_XS).pack(side="left", padx=(SP2, 0))
            tk.Label(foot, text=f"· {_age}", bg=CARD,
                     fg=self.T("RED") if _stalled else MUTED,
                     font=BF_XS).pack(side="left", padx=(SP1, 0))
            if _stalled:
                tk.Label(foot, text="· NOT STARTED", bg=CARD,
                         fg=self.T("RED"), font=BF_XS).pack(side="left",
                                                            padx=(SP1, 0))
            _dots = tk.Button(foot, text="⋮", bg=CARD, fg=MUTED, font=BF_SMB,
                              relief="flat", bd=0, cursor="hand2", width=2,
                              activebackground=CARD, activeforeground=FG)
            _dots.config(command=lambda pp=p, a=_dots: _card_menu(pp, a))
            _dots.pack(side="right")
            _hover(_dots, CARD, CARD, MUTED, FG)

            # ── column 2: supplier ─────────────────────────────────────
            c2 = tk.Frame(row, bg=CARD, padx=SP3, pady=SP2)
            c2.grid(row=0, column=1, sticky="nsew")
            _sup = (p.get("supplier") or "").strip()
            # Fall back to Product, which is where a supplier link ended up
            # being written before this column existed.
            _sup = _sup or (p.get("product") or "").strip()
            # Blank, not "—". An empty cell in a ruled table already reads
            # as "nothing here"; a dash is one more mark to look at and
            # dismiss, on every row, in a column that is mostly empty.
            _sl = tk.Label(c2, text=_sup, bg=CARD,
                           fg=ACC if _sup.startswith("http") else FG,
                           font=BF_SM, anchor="nw", justify="left")
            _sl.pack(fill="x")
            _wrappers.append((_sl, 0.24))
            _mkt = (p.get("market") or "").strip()
            if _mkt:
                # Monochrome glyphs, not colour emoji. An emoji is painted
                # by the font in its own fixed colours, so it ignores the
                # theme entirely — on WAR ROOM's near-black card the
                # bright 🌐 and 📅 were the two most eye-catching things
                # on a row, outshouting the project name for no reason.
                # These inherit MUTED like every other secondary mark.
                tk.Label(c2, text=f"◈  {_mkt}", bg=CARD, fg=MUTED,
                         font=BF_XS, anchor="w").pack(fill="x", pady=(SP1, 0))

            # ── column 3: roadmap ──────────────────────────────────────
            c3 = tk.Frame(row, bg=CARD, padx=SP3, pady=SP2)
            c3.grid(row=0, column=2, sticky="nsew")
            acts = p.get("next_actions", [])
            _tl = (p.get("timeline") or "").strip()
            if _tl:
                tk.Label(c3, text=f"◷  {_tl}", bg=CARD, fg=MUTED, font=BF_XS,
                         anchor="w").pack(fill="x")
            if acts:
                _done = sum(1 for a in acts if a.get("done"))
                tk.Label(c3, text=f"{_done} / {len(acts)} done", bg=CARD,
                         fg=ACC if _done else MUTED, font=BF_XS,
                         anchor="w").pack(fill="x", pady=(0, 2))
                for a in acts[:4]:
                    _ar = tk.Frame(c3, bg=CARD)
                    _ar.pack(fill="x")
                    _mk = tk.Label(_ar, text="✓" if a.get("done") else "○",
                                   bg=CARD,
                                   fg=ACC if a.get("done") else MUTED,
                                   font=BF_XS, cursor="hand2", width=2)
                    _mk.pack(side="left")
                    _tx = tk.Label(_ar, text=a.get("text", ""), bg=CARD,
                                   fg=MUTED if a.get("done") else FG,
                                   font=BF_XS, anchor="w", cursor="hand2",
                                   justify="left")
                    _tx.pack(side="left", fill="x", expand=True)
                    _wrappers.append((_tx, 0.24))

                    def _tog(e=None, aa=a):
                        aa["done"] = not aa.get("done", False)
                        _save()
                        _render()
                    _mk.bind("<Button-1>", _tog)
                    _tx.bind("<Button-1>", _tog)
                if len(acts) > 4:
                    tk.Label(c3, text=f"+{len(acts) - 4} more", bg=CARD,
                             fg=MUTED, font=BF_XS, anchor="w").pack(fill="x")
            elif not _tl:
                # No actions and no timeline: say what is missing, not
                # "—". This is the one place a blank is worth a word,
                # because an empty roadmap is the actionable finding.
                tk.Label(c3, text="no actions yet", bg=CARD, fg=_EMPTY_C,
                         font=BF_XS, anchor="w").pack(fill="x")

            # Column separators, drawn over the cells so they run the full
            # height of whichever column turned out tallest.
            for ci in (1, 2):
                tk.Frame(row, bg=BORDER, width=1).grid(
                    row=0, column=ci, sticky="nsw")

            tk.Frame(block, bg=_RULE_SOFT, height=1).pack(fill="x")

            # Press anywhere on the row to drag it, or to open it. Buttons
            # (the ⋮ menu, the action ticks) keep their own handlers —
            # `add="+"` means these are additional bindings, not
            # replacements, and a Button consumes the click itself.
            _tintable = []

            def _arm(w, depth=0):
                _drag_bind(w, p)
                # Collect only the widgets currently sitting on the plain
                # card colour. The status badge and the accent rules carry
                # their own backgrounds and must survive a hover untouched.
                try:
                    if str(w.cget("bg")) == CARD:
                        _tintable.append(w)
                except tk.TclError:
                    pass
                if depth < 4:
                    for ch in w.winfo_children():
                        if not isinstance(ch, tk.Button):
                            _arm(ch, depth + 1)
            _arm(row)

            # A row that lights up under the pointer is what tells you the
            # page is something you act on, not a printout you look at.
            def _wash(colour):
                for w in _tintable:
                    try:
                        w.config(bg=colour)
                    except tk.TclError:
                        pass
            row.bind("<Enter>", lambda e: _wash(_HOVER), add="+")
            row.bind("<Leave>", lambda e: _wash(CARD), add="+")
            # The drop indicator has to repaint the same widgets the hover
            # does. Colouring the outer `block` looks like nothing happens:
            # `row` sits on top of it and covers every visible pixel.
            block._bdp_wash = _wash

            if state["sort"] == "manual":
                row.config(cursor="fleur")
            return block

        def _build_row(parent, p, idx):
            acc = SC.get(p.get("status", "IDEA"), ACC)
            row = tk.Frame(parent, bg=CARD, highlightthickness=1,
                           highlightbackground=BORDER)
            row.pack(fill="x", pady=2)
            tk.Frame(row, bg=acc, width=3).pack(side="left", fill="y")
            _in = tk.Frame(row, bg=CARD, padx=SP3, pady=SP2)
            _in.pack(side="left", fill="x", expand=True)
            line = tk.Frame(_in, bg=CARD)
            line.pack(fill="x")
            tk.Label(line, text=f"{idx}. {p.get('title', '')}", bg=CARD,
                     fg=FG, font=BF_SMB, anchor="w"
                     ).pack(side="left", padx=(0, SP3))
            _d = tk.Button(line, text="⋮", bg=CARD, fg=MUTED, font=BF_SMB,
                           relief="flat", bd=0, cursor="hand2", width=2,
                           activebackground=CARD)
            _d.config(command=lambda pp=p, a=_d: _card_menu(pp, a))
            _d.pack(side="right")
            acts = p.get("next_actions", [])
            _bits = [p.get("market") or "—", p.get("status", "IDEA"),
                     p.get("priority", "MEDIUM"), p.get("timeline") or "—"]
            if acts:
                _bits.append(f"{sum(1 for a in acts if a.get('done'))}/{len(acts)}")
            tk.Label(line, text="   |   ".join(_bits), bg=CARD, fg=MUTED,
                     font=BF_XS).pack(side="right", padx=(SP3, SP3))

            # Same press-to-drag / click-to-open gesture as the table, so
            # the two views behave identically.
            _tintable = []

            def _arm(w, depth=0):
                _drag_bind(w, p)
                try:
                    if str(w.cget("bg")) == CARD:
                        _tintable.append(w)
                except tk.TclError:
                    pass
                if depth < 3:
                    for ch in w.winfo_children():
                        if not isinstance(ch, tk.Button):
                            _arm(ch, depth + 1)
            _arm(row)

            def _wash(colour):
                for w in _tintable:
                    try:
                        w.config(bg=colour)
                    except tk.TclError:
                        pass
            row.bind("<Enter>", lambda e: _wash(_HOVER), add="+")
            row.bind("<Leave>", lambda e: _wash(CARD), add="+")
            row._bdp_wash = _wash

            if state["sort"] == "manual":
                row.config(cursor="fleur")
            return row

        # ── Full-page project view ────────────────────────────────────────────
        # One project, the whole window, every field editable in place.
        # The modal dialog it sits beside is for capturing something fast;
        # this is for sitting with a project and working it out — which is
        # why nothing here is behind a Save button. Each field commits on
        # focus-out, the way a document does.
        def _open_plan_page(p):
            page = tk.Frame(win, bg=BG)
            page.place(relx=0, rely=0, relwidth=1, relheight=1)

            def _close(e=None):
                # Idempotent, and it hands Escape back to the window.
                # Opening a project rebinds <Escape> on `win` itself, so
                # without restoring it here the FIRST Escape would close
                # the page and every one after would still be aimed at a
                # destroyed widget — the window would stop closing on Esc
                # entirely, and each press would raise a TclError.
                if not page.winfo_exists():
                    return
                _save()
                try:
                    win.bind("<Escape>", lambda ev: _on_close())
                except tk.TclError:
                    pass
                page.destroy()
                _render()

            def _sibling(step):
                seq = _visible()
                if p not in seq:
                    return None
                return seq[(seq.index(p) + step) % len(seq)]

            def _go(step):
                nxt = _sibling(step)
                _save()
                page.destroy()
                if nxt is not None:
                    _open_plan_page(nxt)
                else:
                    _render()

            # ── page header ────────────────────────────────────────────
            bar = tk.Frame(page, bg=HDR_BG)
            bar.pack(fill="x")
            bin_ = tk.Frame(bar, bg=HDR_BG, padx=SP4, pady=SP3)
            bin_.pack(fill="x")
            _rt = tk.Frame(bin_, bg=HDR_BG)
            _rt.pack(side="right")
            for _t, _c in (("‹  Prev", lambda: _go(-1)),
                           ("Next  ›", lambda: _go(1))):
                _b = tk.Button(_rt, text=_t, command=_c, bg=CTRL, fg=FG,
                               font=BF_SMB, relief="flat", bd=0,
                               cursor="hand2", padx=SP3, pady=SP1,
                               highlightthickness=1,
                               highlightbackground=CTRL_BD,
                               activebackground=pc["active_btn"])
                _b.pack(side="left", padx=(SP1, 0))
                _hover(_b, CTRL, pc["active_btn"], FG, FG)
            _bk = tk.Button(bin_, text="←  All projects", command=_close,
                            bg=HDR_BG, fg=MUTED, font=BF_SM, relief="flat",
                            bd=0, cursor="hand2", padx=0,
                            activebackground=HDR_BG, activeforeground=FG)
            _bk.pack(side="left")
            _hover(_bk, HDR_BG, HDR_BG, MUTED, FG)
            tk.Frame(page, bg=BORDER, height=1).pack(fill="x")

            # ── scrolling body ─────────────────────────────────────────
            pw = tk.Frame(page, bg=BG)
            pw.pack(fill="both", expand=True)
            pcv = tk.Canvas(pw, bg=BG, highlightthickness=0)
            psb = tk.Scrollbar(pw, orient="vertical", command=pcv.yview)
            _style_sb(psb, BG, _blend(BG, self.T("TEXT3"), 0.5))
            psb.pack(side="right", fill="y")
            pcv.pack(side="left", fill="both", expand=True)
            pcv.configure(yscrollcommand=psb.set)
            inner = tk.Frame(pcv, bg=BG)
            _iw = pcv.create_window((0, 0), window=inner, anchor="nw")
            inner.bind("<Configure>",
                       lambda e: pcv.configure(scrollregion=pcv.bbox("all")))
            # Centre the column and cap its width. A field stretched across
            # a 1900px monitor is unreadable — the eye loses the line.
            def _pw_resize(e):
                _w = min(e.width, 980)
                pcv.itemconfig(_iw, width=_w)
                pcv.coords(_iw, max((e.width - _w) // 2, 0), 0)
            pcv.bind("<Configure>", _pw_resize)
            pcv.bind("<MouseWheel>",
                     lambda e: pcv.yview_scroll(int(-1 * (e.delta / 120)),
                                                "units"))

            pad = tk.Frame(inner, bg=BG, padx=SP5, pady=SP4)
            pad.pack(fill="both", expand=True)

            # ── title ──────────────────────────────────────────────────
            t_var = tk.StringVar(value=p.get("title", ""))
            t_e = tk.Entry(pad, textvariable=t_var, bg=BG, fg=FG,
                           insertbackground=ACC, relief="flat", bd=0,
                           font=(_F, 24, "bold"), highlightthickness=0)
            t_e.pack(fill="x")

            def _commit_title(e=None):
                p["title"] = t_var.get().strip() or p.get("title", "Untitled")
                p["updated"] = str(date.today())
            t_e.bind("<FocusOut>", _commit_title)

            _meta = tk.Frame(pad, bg=BG)
            _meta.pack(fill="x", pady=(2, SP3))
            _cr = p.get("created") or p.get("updated") or ""
            tk.Label(_meta, text=f"Added {_cr}" if _cr else "", bg=BG,
                     fg=MUTED, font=BF_XS).pack(side="left")

            def _sect(title):
                tk.Frame(pad, bg=BORDER, height=1).pack(fill="x",
                                                        pady=(SP4, SP2))
                tk.Label(pad, text=title, bg=BG, fg=MUTED, font=BF_XS,
                         anchor="w").pack(fill="x", pady=(0, SP1))

            def _field(label, key, height=1, hint=""):
                """Label above, input below, full width. Commits on
                focus-out — there is no Save button on this page."""
                tk.Label(pad, text=label, bg=BG, fg=MUTED, font=BF_XS,
                         anchor="w").pack(fill="x", pady=(SP2, 2))
                if height > 1:
                    t = tk.Text(pad, bg=CTRL, fg=FG, font=BF_SM,
                                height=height, relief="flat", wrap="word",
                                insertbackground=ACC, highlightthickness=1,
                                highlightbackground=CTRL_BD,
                                highlightcolor=ACC, padx=SP3, pady=SP2)
                    t.insert("1.0", str(p.get(key, "") or ""))
                    t.pack(fill="x")

                    def _c(e=None, w=t, k=key):
                        p[k] = w.get("1.0", "end-1c").strip()
                        p["updated"] = str(date.today())
                    t.bind("<FocusOut>", _c)
                else:
                    v = tk.StringVar(value=str(p.get(key, "") or ""))
                    en = tk.Entry(pad, textvariable=v, bg=CTRL, fg=FG,
                                  font=BF_SM, relief="flat",
                                  insertbackground=ACC, highlightthickness=1,
                                  highlightbackground=CTRL_BD,
                                  highlightcolor=ACC)
                    en.pack(fill="x", ipady=6, ipadx=SP2)

                    def _c(e=None, vv=v, k=key):
                        p[k] = vv.get().strip()
                        p["updated"] = str(date.today())
                    en.bind("<FocusOut>", _c)
                if hint:
                    tk.Label(pad, text=hint, bg=BG, fg=MUTED, font=BF_XS,
                             anchor="w").pack(fill="x")

            def _chips(label, key, opts):
                tk.Label(pad, text=label, bg=BG, fg=MUTED, font=BF_XS,
                         anchor="w").pack(fill="x", pady=(SP2, 2))
                holder = tk.Frame(pad, bg=BG)
                holder.pack(fill="x")
                btns = {}

                def _paint():
                    for o, b in btns.items():
                        on = p.get(key) == o
                        col = SC.get(o) or PRI.get(o) or ACC
                        b.config(bg=col if on else CTRL,
                                 fg=_ink(col) if on else MUTED,
                                 activebackground=col if on
                                 else pc["active_btn"])
                for o in opts:
                    b = tk.Button(holder, text=o, font=BF_XS, relief="flat",
                                  bd=0, cursor="hand2", padx=SP3, pady=4,
                                  highlightthickness=0)

                    def _pick(o=o, k=key):
                        p[k] = o
                        p["updated"] = str(date.today())
                        _paint()
                    b.config(command=_pick)
                    b.pack(side="left", padx=(0, 4))
                    btns[o] = b
                _paint()

            def _stars(label, key):
                tk.Label(pad, text=label, bg=BG, fg=MUTED, font=BF_XS,
                         anchor="w").pack(fill="x", pady=(SP2, 2))
                holder = tk.Frame(pad, bg=BG)
                holder.pack(fill="x")
                lb = tk.Label(holder, bg=BG, font=(_F, 15))
                lb.pack(side="left")
                col = (self.T("DONE_GREEN") if key == "potential"
                       else PRI["MEDIUM"])
                if not night:
                    col = _mix(col, "#000000", 0.25)

                def _paint():
                    n = max(0, min(5, int(p.get(key) or 0)))
                    lb.config(text="★" * n + "☆" * (5 - n), fg=col)
                for d, tx in ((-1, "−"), (1, "+")):
                    def _bump(d=d, k=key):
                        p[k] = max(0, min(5, int(p.get(k) or 0) + d))
                        p["updated"] = str(date.today())
                        _paint()
                    tk.Button(holder, text=tx, command=_bump, font=BF_XS,
                              bg=CTRL, fg=FG, relief="flat", bd=0, width=2,
                              cursor="hand2",
                              activebackground=pc["active_btn"]
                              ).pack(side="left", padx=(SP2, 0))
                _paint()

            # ── the fields ─────────────────────────────────────────────
            _sect("THE IDEA")
            _field("Opportunity — why is this worth your time?",
                   "opportunity", height=4)
            _chips("Status", "status", self._BDP_STATUSES)
            _chips("Priority", "priority", self._BDP_PRIORITIES)

            _sect("WHO AND WHERE")
            for _lb, _k in (("Market", "market"), ("Target customer", "target"),
                            ("Niche", "niche"), ("Business model", "model"),
                            ("Product", "product"), ("Service", "service"),
                            ("Supplier", "supplier")):
                _field(_lb, _k)

            _sect("WORTH IT?")
            _stars("Potential", "potential")
            _stars("Difficulty", "difficulty")
            _field("Investment (৳)", "cost_amount")
            _field("Yearly profit (৳)", "yearly_profit")

            _sect("ROADMAP")
            _field("Timeline", "timeline", hint="e.g. 3 Months")
            _actions_block(pad, p)

            _sect("NOTES")
            _field("Notes", "notes", height=6)
            tk.Frame(pad, bg=BG, height=SP6).pack(fill="x")

            page.bind("<Escape>", _close)
            win.bind("<Escape>", _close)
            t_e.focus_set()

        def _actions_block(parent, p):
            """The next-action checklist, editable in place: tick, rename,
            remove, add. On the table this column is read-only, because a
            row has no room for four controls per line."""
            host = tk.Frame(parent, bg=BG)
            host.pack(fill="x")

            def _redraw():
                for w in host.winfo_children():
                    w.destroy()
                acts = p.setdefault("next_actions", [])
                for i, a in enumerate(acts):
                    r = tk.Frame(host, bg=BG)
                    r.pack(fill="x", pady=1)
                    mk = tk.Label(r, text="✓" if a.get("done") else "○",
                                  bg=BG, fg=ACC if a.get("done") else MUTED,
                                  font=BF_SMB, cursor="hand2", width=2)
                    mk.pack(side="left")

                    def _tog(e=None, aa=a):
                        aa["done"] = not aa.get("done", False)
                        _save()
                        _redraw()
                    mk.bind("<Button-1>", _tog)

                    v = tk.StringVar(value=a.get("text", ""))
                    en = tk.Entry(r, textvariable=v, bg=CTRL, fg=FG,
                                  font=BF_SM, relief="flat",
                                  insertbackground=ACC, highlightthickness=1,
                                  highlightbackground=CTRL_BD,
                                  highlightcolor=ACC)
                    en.pack(side="left", fill="x", expand=True,
                            ipady=4, ipadx=SP2)

                    def _c(e=None, vv=v, aa=a):
                        aa["text"] = vv.get().strip()
                    en.bind("<FocusOut>", _c)

                    def _del(idx=i):
                        p["next_actions"].pop(idx)
                        _save()
                        _redraw()
                    _x = tk.Button(r, text="✕", command=_del, bg=BG,
                                   fg=MUTED, font=BF_XS, relief="flat",
                                   bd=0, cursor="hand2", width=2,
                                   activebackground=BG)
                    _x.pack(side="left", padx=(SP1, 0))
                    _hover(_x, BG, pc["active_btn"], MUTED, self.T("RED"))

                def _add():
                    p.setdefault("next_actions", []).append(
                        {"text": "", "done": False})
                    _save()
                    _redraw()
                _a = tk.Button(host, text="+  Add action", command=_add,
                               bg=BG, fg=ACC, font=BF_XS, relief="flat",
                               bd=0, cursor="hand2", anchor="w", padx=0,
                               activebackground=BG)
                _a.pack(fill="x", pady=(SP2, 0))
            _redraw()

        def _render():
            for w in body.winfo_children():
                w.destroy()
            for w in chip_bar.winfo_children():
                w.destroy()

            vis = _visible()
            n_arch = sum(1 for p in plans if p.get("archived"))

            # Filter summary — only rendered when a filter is on, so the
            # bar costs nothing in the normal case.
            _active = [(k, lbl) for k, lbl in (("f_status", "Status"),
                                               ("f_pri", "Priority"),
                                               ("f_market", "Market"))
                       if state[k] != "All"]
            if _active or state["q"]:
                cb = tk.Frame(chip_bar, bg=BG, padx=SP4, pady=SP1)
                cb.pack(fill="x")
                for k, lbl in _active:
                    tk.Label(cb, text=f" {lbl}: {state[k]} ", bg=CTRL, fg=FG,
                             font=BF_XS).pack(side="left", padx=(0, SP1))
                if state["q"]:
                    tk.Label(cb, text=f' “{state["q"]}” ', bg=CTRL, fg=FG,
                             font=BF_XS).pack(side="left", padx=(0, SP1))

                def _clear_all():
                    state.update(f_status="All", f_pri="All", f_market="All",
                                 q="")
                    q_var.set("")
                    _render()
                _cl = tk.Button(cb, text="clear", command=_clear_all, bg=BG,
                                fg=ACC, font=BF_XS, relief="flat", bd=0,
                                cursor="hand2", activebackground=BG)
                _cl.pack(side="left")

            grid = tk.Frame(body, bg=BG, padx=SP3, pady=SP3)
            grid.pack(fill="both", expand=True)

            if not vis:
                _msg = ("No plans match this filter"
                        if (_active or state["q"])
                        else "No business plans yet")
                _sub = ("Try clearing the filter or the search box."
                        if (_active or state["q"])
                        else "Capture the first idea — it takes about "
                             "15 seconds with Quick.")
                _e = tk.Frame(grid, bg=BG)
                _e.pack(fill="both", expand=True, pady=SP6)
                tk.Label(_e, text="◆", bg=BG, fg=MUTED, font=BF_H1).pack()
                tk.Label(_e, text=_msg, bg=BG, fg=FG, font=BF_SMB).pack()
                tk.Label(_e, text=_sub, bg=BG, fg=MUTED, font=BF_XS).pack()
            elif state["view"] == "list":
                _drag_targets_rebuild([(_build_row(grid, p, i), p)
                                       for i, p in enumerate(vis, 1)])
            else:
                _tbl_header(grid)
                _targets = []
                for i, p in enumerate(vis, 1):
                    _targets.append((_build_table_block(grid, p, i), p))
                _drag_targets_rebuild(_targets)

            _txt = f"  {len(vis)} of {len(plans) - n_arch} plans"
            if n_arch:
                _txt += f"  ·  {n_arch} archived"
            status_lbl.config(text=_txt + "   ·   Esc closes")
            cv.update_idletasks()
            cv.configure(scrollregion=cv.bbox("all"))

        # Bottom bar first, then the expanding card area — see the note
        # at `wrap`'s creation for why this order matters.
        tk.Frame(win, bg=BORDER, height=1).pack(fill="x", side="bottom")
        status_lbl.pack(fill="x", side="bottom", pady=2)
        wrap.pack(fill="both", expand=True)
        _seed_order()
        _render()

        # ── Close handler ─────────────────────────────────────────────────────
        def _on_close():
            _save_main_title()
            try:
                self._detail_geometries["self_dev"] = (
                    "zoomed" if win.state() == "zoomed" else win.geometry())
                save_data(self)
            except Exception as _e:
                log.debug("suppressed: %s", _e)
            try:
                delattr(self, win_attr)
            except Exception as _e:
                log.debug("suppressed: %s", _e)
            win.destroy()
        win.protocol("WM_DELETE_WINDOW", _on_close)
        win.bind("<Escape>", lambda e: _on_close())

    # ── Insights — sparkline, weekly score, session stats ────────────────────
    # ── Deep-work trend chart ────────────────────────────────────────────
    # Room for the y-axis hour labels. 26 was enough for the old "5h"
    # Settings goal; the goal is now a sum of per-project targets and
    # reads like "7h 05m", which was being clipped to "l333h".
    _TREND_PAD_L = 44
    _TREND_PAD_B = 12      # room for the date labels
    _TREND_PAD_T = 6

    def _set_trend_days(self, n):
        if int(self._settings.get("trend_days", 30)) == n:
            return
        self._settings["trend_days"] = int(n)
        save_data(self)
        self._apply_theme(self._mode)

    def _trend_series(self):
        """(days, secs_per_day) ending today. Today reads the LIVE
        counter rather than daily_history, which is only written at
        rollover — otherwise the most recent point would sit at zero
        all day, exactly when you're most likely to be looking at it."""
        import datetime as _dt
        n = int(self._settings.get("trend_days", 30))
        n = 90 if n not in (30, 90) else n
        today = _dt.date.today()
        days = [today - _dt.timedelta(days=i) for i in range(n - 1, -1, -1)]
        # Never plot days from BEFORE you started using the app.
        #
        # Those are not zero-hour days, they are days that were never
        # measured — and drawing them as zeros was what made a new user's
        # chart a wall of red "you did nothing" dots. Clipping the window
        # to start_date is the honest fix, and it is what lets the chart
        # draw from day one instead of hiding until day three.
        try:
            _from = _dt.date.fromisoformat(str(self.start_date))
            days = [d for d in days if d >= _from] or days[-1:]
        except Exception as e:
            log.debug("trend start clip: %s", e)
        vals = [self._hist_secs(d) for d in days[:-1]] + \
            [max(int(self.progress_secs), self._hist_secs(today))]
        return days, vals

    @staticmethod
    def _moving_avg(vals, window=7):
        """Trailing mean. Daily deep-work hours are noisy enough that the
        raw line alone reads as static — the average is what actually
        shows a direction. Uses however many days exist at the start
        rather than leaving a gap, so the line starts at x=0."""
        out = []
        run = 0.0
        for i, v in enumerate(vals):
            run += v
            if i >= window:
                run -= vals[i - window]
            out.append(run / min(i + 1, window))
        return out

    def _update_week_line(self):
        """Fill the one-line week summary above the chart.

        Three facts, in the order they're useful: how much, how many
        days on target, and the best day. 'days on target' is the one
        that actually changes behaviour — total hours can be one heroic
        Tuesday, which is the pattern this app exists to break."""
        _wl = self._alive("week_lbl")
        if _wl is None:
            return
        try:
            import datetime as _dt
            goal = max(1.0, float(self._goal_secs()))
            today = _dt.date.today()
            days = [today - _dt.timedelta(days=i) for i in range(6, -1, -1)]
            vals = [self._hist_secs(d) for d in days[:-1]] + \
                [max(int(self.progress_secs), self._hist_secs(today))]
            total = sum(vals)
            if total <= 0:
                # Nothing logged all week — say that plainly instead of
                # printing "0h 0m · 0 of 7 days · best —", which is three
                # ways of saying the same nothing.
                _wl.config(text="This week: nothing logged yet")
                return
            hit = sum(1 for v in vals if v >= goal)
            bi = max(range(len(vals)), key=lambda i: vals[i])

            def _hm(x):
                return f"{int(x // 3600)}h {int(x % 3600 // 60):02d}m"
            _wl.config(text=f"This week: {_hm(total)}  ·  {hit} of 7 days "
                            f"on target  ·  best {days[bi].strftime('%a')} "
                            f"{_hm(vals[bi])}")
        except Exception as e:
            log.debug("week line: %s", e)

    def _draw_trend(self, hover_i=None):
        """Line chart of daily deep-work time.

        Three layers, in deliberate order of visual weight:
          1. dotted goal line   — the reference, quietest
          2. raw daily line     — thin and pale; it's the noise
          3. 7-day average      — thick accent; it's the signal
        Zero days get a red dot, because a gap is the single most
        actionable thing this chart can show (same reasoning as the
        Consistency tab: surface the gap, don't grade the average)."""
        c = self._alive("trend_cv")
        if c is None:
            return
        try:
            c.delete("all")
            w = c.winfo_width()
            h = c.winfo_height()
            if h < 8:
                h = int(c["height"])
            if w < 60 or h < 30:
                return

            days, vals = self._trend_series()
            n = len(vals)
            goal = max(1.0, float(self._goal_secs()))
            pc = _PANEL_COLORS[self._mode]
            acc = self.T("GREEN")
            mut = pc["muted"]
            grid_c = pc["pb_empty"]

            # ── What is withheld before day three is the TREND LINE,
            #    not the chart ──────────────────────────────────────────
            # This used to blank the whole card and print "collecting
            # data" in the middle of it — roughly 150px held to say one
            # sentence, on the same panel where an empty NOW card and
            # empty hour rows were both taught to get out of the way.
            #
            # Your two days ARE real information: the goal line and the
            # bars for those days can be drawn honestly from day one. The
            # only thing two points cannot support is a claim about
            # direction, so that is the only thing held back — a 7-day
            # average of two days would just be those two days, drawn
            # thicker and dressed up as a finding.
            _live = sum(1 for v in vals if v > 0)
            _show_avg = _live >= 3
            if len(vals) < 2:
                c.create_text(w / 2, h / 2,
                              text="Start a project timer — today lands here",
                              font=F_XS, fill=mut)
                _hl = self._alive("trend_hint")
                if _hl is not None:
                    _hl.config(text="")
                return

            L, B, T = self._TREND_PAD_L, self._TREND_PAD_B, self._TREND_PAD_T
            x0, x1 = L, w - 4
            y0, y1 = T, h - B
            if x1 - x0 < 20 or y1 - y0 < 12:
                return

            # Scale headroom to the goal OR the best day, whichever is
            # bigger — a day that beat the target must not be clipped
            # off the top of the chart.
            top_secs = max(goal, max(vals) if vals else 0) * 1.12
            avg = self._moving_avg(vals)

            def _px(i):
                return x0 + (x1 - x0) * (i / max(1, n - 1))

            def _py(v):
                return y1 - (y1 - y0) * min(1.0, v / top_secs)

            # ── "this week" band — the last 7 points, tinted.
            # Drawn FIRST so everything else sits on top of it. This is
            # what replaces a separate 7-day view: the week is visible,
            # but in context. Twelve hours this week only means
            # something next to the eighteen or the eight before it.
            if n > 7:
                _bx = _px(max(0, n - 7))
                c.create_rectangle(_bx, y0, x1, y1,
                                   fill=_heat(acc, 0.0, cold=pc["card2"]),
                                   outline="", stipple="gray25")

            # ── y-axis: 0 and the goal, nothing else. More gridlines
            # would be chartjunk at this size.
            for _sec, _lab in ((0, "0"), (goal, self._fmt_goal(goal))):
                _y = _py(_sec)
                # Two calls rather than one with a conditional `dash=`:
                # Tk's dash option has no portable "solid" value to pass
                # (an empty tuple is accepted on some builds and raises
                # on others), so the baseline just omits it.
                if _sec == 0:
                    c.create_line(x0, _y, x1, _y, fill=grid_c)
                else:
                    c.create_line(x0, _y, x1, _y, fill=grid_c, dash=(2, 3))
                c.create_text(x0 - 4, _y, text=_lab, anchor="e",
                              font=F_XS, fill=mut)

            # ── raw daily line — pale, it is the noise not the signal
            raw_pts = []
            for i, v in enumerate(vals):
                raw_pts += [_px(i), _py(v)]
            if len(raw_pts) >= 4:
                # _heat blends toward `cold` — at frac 0 it sits closest
                # to the card surface, which is exactly the pale version
                # of the accent this line wants. (_hex_blend is a local
                # helper inside the detail/journey windows, not reachable
                # from here.)
                _pale = _heat(acc, 0.0, cold=pc["card2"])
                c.create_line(*raw_pts, fill=_pale, width=1, smooth=False)

            # ── zero days — the gaps, the actionable part.
            # Only marked once they are the EXCEPTION. A red dot on every
            # empty day turns a mostly-empty chart into an unbroken red
            # line, which stops meaning "here is the gap" and starts
            # meaning "everything is bad" — the same reason the streak
            # counter hides itself at zero. Above half-empty the dots
            # would be the chart rather than an annotation on it.
            _zeros = [i for i, v in enumerate(vals) if v <= 0]
            if len(_zeros) <= n * 0.5:
                for i in _zeros:
                    _x, _y = _px(i), _py(0)
                    c.create_oval(_x - 1.5, _y - 1.5, _x + 1.5, _y + 1.5,
                                  fill=self.T("RED"), outline="")

            # ── 7-day average — the signal
            # The averaged line is the only element that CLAIMS a
            # direction, so it is the only one that waits for enough days
            # to have one. Everything above — the goal line, the daily
            # points, the zero-day marks — is fact, and facts can be
            # drawn on day one.
            if _show_avg:
                avg_pts = []
                for i, v in enumerate(avg):
                    avg_pts += [_px(i), _py(v)]
                if len(avg_pts) >= 4:
                    c.create_line(*avg_pts, fill=acc, width=2, smooth=True)
            else:
                # Below the goal line, not on it — at y0 + 8 the notice
                # printed straight through the dotted 6h rule.
                c.create_text(
                    (x0 + x1) / 2, y0 + (y1 - y0) * 0.28,
                    text="trend line appears after %d more day%s"
                         % (3 - _live, "" if 3 - _live == 1 else "s"),
                    font=F_XS, fill=mut)

            # today's marker
            c.create_oval(_px(n - 1) - 2.5, _py(vals[-1]) - 2.5,
                          _px(n - 1) + 2.5, _py(vals[-1]) + 2.5,
                          fill=acc, outline=pc["card2"])

            # ── x-axis: first / middle / last date only
            for _i in (0, n // 2, n - 1):
                if 0 <= _i < n:
                    c.create_text(_px(_i), h - B / 2,
                                  text=days[_i].strftime("%d %b"),
                                  font=F_XS, fill=mut,
                                  anchor="w" if _i == 0 else
                                  ("e" if _i == n - 1 else "center"))

            # ── hover guide
            if hover_i is not None and 0 <= hover_i < n:
                _hx = _px(hover_i)
                c.create_line(_hx, y0, _hx, y1, fill=mut, dash=(2, 2))
                _v = vals[hover_i]
                c.create_oval(_hx - 3, _py(_v) - 3, _hx + 3, _py(_v) + 3,
                              fill=acc, outline=pc["card2"], width=1)
                _hl = self._alive("trend_hint")
                if _hl is not None:
                    _hl.config(text=f"{days[hover_i].strftime('%d %b')} · "
                                    f"{_v // 3600}h {_v % 3600 // 60:02d}m")
            else:
                _hl = self._alive("trend_hint")
                if _hl is not None:
                    # Idle state names the DIRECTION, not the distance to
                    # goal. "34% of target" on a bad week is just a daily
                    # reminder you're failing; "trending up" is true, is
                    # about you, and is something a bad week can still
                    # earn back.
                    # Silent unless there is BOTH a drawable trend and a
                    # real baseline to compare against.
                    #
                    # BUG THIS FIXES: the card said "trend line appears
                    # after 1 more day" and "↗ trending up" at the same
                    # time — refusing to draw a direction while asserting
                    # one in words. The assertion came from comparing this
                    # week against a week with nothing in it: anything
                    # beats zero, so a first-ever day of work always read
                    # as "trending up". A week you did not use the app is
                    # not a week you did less.
                    if n >= 14 and _show_avg:
                        _recent = sum(vals[-7:]) / 7.0
                        _before = sum(vals[-14:-7]) / 7.0
                        if _before <= 0:
                            _hl.config(text="")
                        elif _recent > _before * 1.05:
                            _hl.config(text="↗ trending up")
                        elif _recent < _before * 0.95:
                            _hl.config(text="↘ trending down")
                        else:
                            _hl.config(text="→ holding steady")
                    else:
                        _hl.config(text="")
        except Exception as e:
            log.debug("trend chart: %s", e)

    def _trend_hover(self, event):
        c = self._alive("trend_cv")
        if c is None:
            return
        try:
            w = c.winfo_width()
            n = len(self._trend_series()[1])
            x0, x1 = self._TREND_PAD_L, w - 4
            if x1 <= x0 or n < 2:
                return
            frac = (event.x - x0) / float(x1 - x0)
            self._draw_trend(hover_i=max(0, min(n - 1, round(frac * (n - 1)))))
        except Exception as e:
            log.debug("trend hover: %s", e)

    def _update_insights(self):
        """Refresh the streak counter, capacity hint and trend chart.

        The old WEEK n/100 · avg · best · ✔ stats line this used to fill
        in is gone with the sparkline it sat under — see the comment on
        the trend block in _build_left. The guard now keys off the
        streak label, which exists in BOTH panel-3 views, instead of the
        removed stats_lbl."""
        try:
            if self._alive("streak_lbl") is None and \
                    self._alive("trend_cv") is None:
                return
            n = self._deep_streak()
            _sl = self._alive("streak_lbl")
            if _sl is not None:
                _sl.config(text=f"{n}d streak" if n else "")
            _cap = self._alive("capacity_lbl")
            if _cap is not None:
                _txt = self._capacity_insight() or ""
                _cap.config(text=_txt)
                # Blank for the first few days of use — an empty Label
                # still costs a line height, so remove it rather than
                # reserve space for a hint that isn't there yet.
                if _txt:
                    _cap.grid()
                else:
                    _cap.grid_remove()
            self._update_week_line()
            self._draw_trend()
        except Exception as e:
            log.debug("insights: %s", e)

    def _capacity_insight(self):
        """A 'capacity-aware' suggestion built entirely from the user's
        OWN historical session data already stored on disk — no cloud
        call, no AI API, no new dependency. It aggregates every
        task-timer session's start hour (across CLASSIC + FOCUS tasks)
        into hour-of-day buckets and, only if one hour-of-day clearly
        dominates (>=25% of all logged time, with a minimum sample so a
        single lucky session can't skew it), says so. Returns None —
        shown as nothing — rather than a made-up "you're a morning
        person!" guess when there isn't enough real data yet; an honest
        blank beats a fabricated insight."""
        try:
            buckets = {}
            total = 0.0
            for t in self.tasks + self.tasks_focus:
                for s in t.get("sessions", []):
                    start = s.get("start")
                    if not start:
                        continue
                    end = s.get("end") or start
                    dur = max(0.0, end - start)
                    if dur <= 0:
                        continue
                    hr = datetime.fromtimestamp(start).hour
                    buckets[hr] = buckets.get(hr, 0.0) + dur
                    total += dur
            # Require at least 1h of cumulative logged time before saying
            # anything (guards against a single short session skewing
            # things) — but do NOT also require 2+ distinct hours: a
            # user whose sessions genuinely all cluster in one hour is
            # showing the CLEAREST possible pattern, not a weak one.
            if total < 3600:
                return None
            peak_hr = max(buckets, key=buckets.get)
            if buckets[peak_hr] / total < 0.25:
                return None
            label = (f"{peak_hr % 12 or 12} {'AM' if peak_hr < 12 else 'PM'}")
            return f"⚡ You tend to do deep work around {label} — good time to start"
        except Exception as e:
            log.debug("capacity insight: %s", e)
            return None

    # ── MIT morning prompt — pick today's Most Important Task ────────────────
    def _maybe_mit_prompt(self):
        """Once a day: if no MIT is set, ask which task matters most.

        RETIRED on the FOCUS panel. There is now an MIT tab that asks the
        same question, permanently, in place, with a hard limit of three
        and a running count — and a modal popping over it on launch was
        covering the very screen that answers it. A prompt earns its
        interruption only when nothing on screen already does the job.

        It still runs on the CLASSIC/PLAN list, which has no MIT tab.
        """
        try:
            if self._settings.get("panel3_view", "classic") == "focus":
                return
            today = str(date.today())
            if self._settings.get("mit_prompt_date") == today:
                return
            open_tasks = [t for t in self._task_list() if not t["done"]]
            if not open_tasks:
                return
            if any(t.get("mit") for t in open_tasks):
                return
            self._settings["mit_prompt_date"] = today
            pc = _PANEL_COLORS[self._mode]
            yel = self.T("YELLOW")
            win = tk.Toplevel(self)
            win.title("Today's MIT")
            win.configure(bg=pc["card2"])
            win.transient(self)
            win.resizable(False, False)
            tk.Label(win, text="★  WHAT'S TODAY'S MIT?", bg=pc["card2"],
                     fg=yel, font=F_H2).pack(padx=SP6, pady=(SP4, 2))
            tk.Label(win, text="One Most Important Task. Do it first.",
                     bg=pc["card2"], fg=pc["sec_text"],
                     font=F_XS).pack(pady=(0, SP3))

            def _pick(tid, w=win):
                try:
                    w.destroy()
                except Exception:
                    pass
                self._set_mit(tid)
            for t in open_tasks[:8]:
                b = tk.Button(win, text="☆  " + t["text"][:44],
                              command=lambda x=t["id"]: _pick(x),
                              bg=pc["ctrl_bg"], fg=pc["menu_fg"],
                              font=F_SMALL, relief="flat", bd=0, anchor="w",
                              cursor="hand2", padx=SP3, pady=SP1,
                              activebackground=pc["active_btn"],
                              activeforeground=pc["menu_fg"])
                b.pack(fill="x", padx=SP5, pady=1)
            tk.Button(win, text="Skip today", command=win.destroy,
                      bg=pc["card2"], fg=pc["muted"], font=F_XS,
                      relief="flat", bd=0, cursor="hand2",
                      activebackground=pc["card2"],
                      activeforeground=pc["sec_text"]
                      ).pack(pady=(SP2, SP4))
            win.bind("<Escape>", lambda e: win.destroy())
            win.update_idletasks()
            x = self.winfo_rootx() + (self.winfo_width() - win.winfo_width()) // 2
            y = self.winfo_rooty() + (self.winfo_height() - win.winfo_height()) // 2
            win.geometry(f"+{max(x, 20)}+{max(y, 20)}")
        except Exception as e:
            log.debug("mit prompt: %s", e)

    # ── Weekly review — every Sunday, once ───────────────────────────────────
    @staticmethod
    def _centre_over(px, py, pw, ph, ww, wh, work):
        """Top-left for a wh x ww dialog centred on a parent, kept on screen.

        Pulled out of the dialog so the arithmetic can be tested without
        a display — and it needed testing.

        BUG THIS FIXES: the review window opened hard against the LEFT
        edge of the screen while the app was docked on the RIGHT. The
        cause was the dialog's own width: measured before Windows had
        mapped the window, winfo_width() can come back as garbage, and a
        garbage width larger than the screen made the "keep it on screen"
        clamp (right_edge - width) go negative, which pinned the window
        to the left margin. Centring was working; the clamp was throwing
        the answer away.

        So the width is clamped to the work area FIRST. A dialog can
        never be treated as wider than the screen it has to fit on, and
        the clamp can no longer invert."""
        wl, wt, wr, wb = work
        avail_w, avail_h = max(1, wr - wl), max(1, wb - wt)
        ww = max(1, min(ww, avail_w - 20))
        wh = max(1, min(wh, avail_h - 20))
        x = px + (pw - ww) // 2
        y = py + (ph - wh) // 2
        x = max(wl + 10, min(x, wr - ww - 10))
        y = max(wt + 10, min(y, wb - wh - 10))
        # Last guarantee: whatever the measurements said, the dialog has
        # to end up ON the window that raised it. If clamping has pushed
        # it clear of the parent — which is what happened when the app
        # was docked right and the dialog landed against the left edge —
        # give up on centring and just align the two left edges. A
        # slightly off-centre dialog is a cosmetic problem; one on the
        # far side of a 1920px screen looks like the app has hung,
        # because it holds a modal grab and the window you can see stops
        # responding.
        if x + ww <= px or x >= px + pw:
            x = max(wl + 10, min(px, wr - ww - 10))
        if y + wh <= py or y >= py + ph:
            y = max(wt + 10, min(py, wb - wh - 10))
        return x, y

    @staticmethod
    def _measure(win, axis, lo=120, hi=4000):
        """A believable width/height for a window that may not be mapped.

        Both of Tk's answers can be wrong here, in opposite directions:
        winfo_width/height on an unmapped toplevel is often 1 (Tk's
        placeholder), and winfo_reqwidth/reqheight can come back larger
        than the whole screen while the window manager is still deciding
        what to do with it. Trusting either one alone is what put the
        weekly review in the top-left corner: a "width" of several
        thousand pixels made every centring sum collapse to the margin.

        So take whichever answer is PLAUSIBLE — a real dialog is bigger
        than 120px and smaller than any desktop — and prefer the mapped
        measurement when both are. Returning None is not an option: the
        caller has to place the window somewhere, so an implausible pair
        falls back to the requested size and lets the work-area clamp
        deal with it."""
        real = getattr(win, "winfo_" + axis)()
        req = getattr(win, "winfo_req" + axis)()
        for _v in (real, req):
            if lo <= _v <= hi:
                return _v
        return req or real or lo

    @staticmethod
    def _centre_on_screen(ww, wh, work, frac=0.40):
        """Top-left for a ww x wh dialog centred on the WORK AREA.

        Used instead of _centre_over for dialogs that do not belong to
        what is behind them. The app spends most of its life as a ~585px
        strip docked to the right edge; a full modal centred on that
        strip comes out jammed against the screen's right edge with the
        desktop empty beside it, and on the narrow layouts the strip is
        narrower than the dialog, so "centred on the parent" is not even
        a meaningful instruction.

        The width is clamped to the work area BEFORE it is used, for the
        same reason _centre_over does it: a dialog measured before the
        window manager has mapped it can report a width larger than the
        screen, and subtracting that from the screen width gives a
        NEGATIVE offset — which is how a "centred" dialog ends up pinned
        to the top-left corner. Clamp first and the arithmetic cannot
        invert.

        `frac` is the vertical position of the free space, not of the
        dialog: 0.40 puts it slightly above the true middle, which is
        where an optically centred dialog belongs, and leaves the room
        underneath for a taskbar flyout or an on-screen keyboard."""
        wl, wt, wr, wb = work
        avail_w, avail_h = max(1, wr - wl), max(1, wb - wt)
        ww = max(1, min(ww, avail_w - 20))
        wh = max(1, min(wh, avail_h - 20))
        x = wl + (avail_w - ww) // 2
        y = wt + int((avail_h - wh) * frac)
        x = max(wl + 10, min(x, wr - ww - 10))
        y = max(wt + 10, min(y, wb - wh - 10))
        return x, y

    def _show_quarter_plan(self):
        """The 90-day plan: six areas, three questions each.

        An ACCORDION, not a scrolling column of eighteen boxes and not
        six tabs. Eighteen boxes is a wall you close; six tabs hide the
        five areas you are not looking at, which is exactly the thing a
        whole-life plan must not do — the value is seeing that Health
        has an outcome and Relationship still does not. Collapsed rows
        show each area's outcome on one line, so the whole plan reads at
        a glance; one row opens at a time to write in."""
        pc = _PANEL_COLORS[self._mode]
        acc = self.T("GREEN")
        card = pc["card2"]
        mut = pc["sec_text"]
        fg = pc["menu_fg"]
        bn = self._settings.get("lang") == "bn"
        def L(en, b): return b if bn else en

        old = self._alive("_q90_win")
        if old is not None:
            try:
                old.lift()
                old.focus_force()
                return
            except Exception:
                pass

        win = tk.Toplevel(self)
        self._q90_win = win
        win.title("%d-Day Plan" % self._cycle_days())
        win.configure(bg=card)
        win.transient(self)
        win.resizable(False, False)
        try:
            win.grab_set()
        except Exception:
            pass

        start, end = self._cycle_span()
        day, total, left = self._cycle_progress()
        done_n, total_n = self._q90_counts()

        # ── Header: which cycle, and how much of it is gone ────────────
        # The countdown is the whole reason this is a CYCLE and not a
        # list of intentions. A deadline you can see is the part that
        # does the work; "sometime this year" is what the same six lines
        # become without it.
        _hd = tk.Frame(win, bg=card)
        _hd.pack(fill="x", padx=SP6, pady=(SP5, 0))
        _hd.columnconfigure(0, weight=1)
        tk.Label(_hd, text=L("%d-DAY PLAN" % total,
                             "%d \u09a6\u09bf\u09a8\u09c7\u09b0 \u09aa\u09b0\u09bf\u0995\u09b2\u09cd\u09aa\u09a8\u09be" % total),
                 bg=card, fg=acc, font=F_H1, anchor="w").grid(
            row=0, column=0, sticky="w")
        tk.Label(_hd, text="%d/%d %s" % (done_n, total_n,
                                         L("areas set", "\u0995\u09cd\u09b7\u09c7\u09a4\u09cd\u09b0")),
                 bg=card, fg=mut, font=F_SMALL_B, anchor="e").grid(
            row=0, column=1, sticky="e")

        # The dates are the control. Making the range itself the button —
        # rather than hiding a gear somewhere — means the thing you want
        # to change is the thing you click, and the label doubles as the
        # answer to "from when to when" without opening anything.
        _dates = tk.Frame(win, bg=card)
        _dates.pack(fill="x", padx=SP6, pady=(2, 4))
        _when = (L("starts in %d days" % (left - total),
                   "%d \u09a6\u09bf\u09a8 \u09aa\u09b0\u09c7 \u09b6\u09c1\u09b0\u09c1" % (left - total))
                 if day == 0 else
                 L("day %d of %d, %d left" % (day, total, left),
                   "%d/%d \u09a6\u09bf\u09a8, \u0986\u09b0 %d" % (day, total, left)))
        _rng = tk.Button(
            _dates,
            text="%s  \u2192  %s   \u00b7   %s   \u270e" % (
                start.strftime("%d %b %Y"), end.strftime("%d %b %Y"),
                _when),
            bg=card, fg=mut, font=F_SMALL, relief="flat", bd=0,
            cursor="hand2", padx=0, pady=0, highlightthickness=0,
            anchor="w", activebackground=card, activeforeground=acc,
            command=lambda: _edit_cycle())
        _rng.pack(fill="x")
        _hover(_rng, card, card, mut, acc)
        _add_tooltip(_rng, L("Change the start date or the length",
                             "\u09b6\u09c1\u09b0\u09c1\u09b0 \u09a4\u09be\u09b0\u09bf\u0996 \u09ac\u09be \u09a6\u09c8\u09b0\u09cd\u0998\u09cd\u09af \u09ac\u09a6\u09b2\u09be\u09a8"))

        def _edit_cycle():
            """Inline editor: length presets, a custom box, and a start
            date. Inline rather than a second dialog — a modal on top of
            a modal to change two numbers is how settings screens get
            their reputation."""
            _ed = tk.Toplevel(win)
            _ed.title(L("Plan cycle", "\u09aa\u09b0\u09bf\u0995\u09b2\u09cd\u09aa\u09a8\u09be\u09b0 \u09b8\u09ae\u09af\u09bc"))
            _ed.configure(bg=card)
            _ed.transient(win)
            _ed.resizable(False, False)
            try:
                _ed.grab_set()
            except Exception:
                pass

            tk.Label(_ed, text=L("HOW LONG IS ONE CYCLE?",
                                 "\u098f\u0995 \u099a\u0995\u09cd\u09b0 \u0995\u09a4 \u09a6\u09bf\u09a8?"),
                     bg=card, fg=mut, font=F_XS, anchor="w").pack(
                fill="x", padx=SP5, pady=(SP5, SP2))

            # ONE value, shown two ways.
            #
            # BUG THIS FIXES: the presets wrote to an IntVar while the
            # box kept its own text, and Apply read the BOX — which was
            # pre-filled with the current length and never cleared. So
            # clicking 30 set the variable to 30, the box still said 90,
            # and 90 is what got saved: the presets looked broken while
            # the custom box worked. Same shape of bug as the two
            # layout-width tables earlier — two places holding one
            # number, and the reader picking the stale one.
            _lenv = tk.StringVar(value=str(total))
            _row = tk.Frame(_ed, bg=card)
            _row.pack(fill="x", padx=SP5)
            _btns_len = {}

            def _paint_len(*_a):
                _cur = self._parse_cycle_len(_lenv.get(), None)
                for _n, _b in _btns_len.items():
                    _on = (_cur == _n)
                    _b.config(bg=acc if _on else pc["ctrl_bg"],
                              fg=_ink(acc) if _on else fg)

            for _n in self.CYCLE_PRESETS:
                _b = tk.Button(_row, text="%d" % _n, font=F_SMALL_B,
                               relief="flat", bd=0, cursor="hand2",
                               padx=SP4, pady=4, highlightthickness=0,
                               command=lambda v=_n: _lenv.set(str(v)))
                _b.pack(side="left", padx=(0, SP2))
                _btns_len[_n] = _b
            tk.Label(_row, text=L("days", "\u09a6\u09bf\u09a8"), bg=card, fg=mut,
                     font=F_XS).pack(side="left", padx=(0, SP3))
            _custom = tk.Entry(_row, width=5, textvariable=_lenv,
                               bg=pc["ctrl_bg"],
                               fg=pc["input_fg"], relief="flat",
                               font=F_SMALL, justify="center",
                               insertbackground=pc["input_fg"])
            _custom.pack(side="left", ipady=3)
            tk.Label(_row, text=L("or type any", "\u09ac\u09be \u09b2\u09bf\u0996\u09c1\u09a8"),
                     bg=card, fg=mut, font=F_XS).pack(side="left",
                                                      padx=(SP1, 0))
            # The box IS the value, so pressing a preset must be visible
            # in it — one trace keeps the highlight and the text agreeing
            # whichever way the number was entered.
            _lenv.trace_add("write", _paint_len)
            _paint_len()

            tk.Label(_ed, text=L("STARTING FROM", "\u09b6\u09c1\u09b0\u09c1 \u09b9\u09ac\u09c7"),
                     bg=card, fg=mut, font=F_XS, anchor="w").pack(
                fill="x", padx=SP5, pady=(SP4, SP2))
            _srow = tk.Frame(_ed, bg=card)
            _srow.pack(fill="x", padx=SP5)
            _sv = tk.StringVar(value=str(start))
            _se = tk.Entry(_srow, textvariable=_sv, width=12,
                           bg=pc["ctrl_bg"], fg=pc["input_fg"],
                           relief="flat", font=F_SMALL, justify="center",
                           insertbackground=pc["input_fg"])
            _se.pack(side="left", ipady=3)
            tk.Label(_srow, text="YYYY-MM-DD", bg=card, fg=mut,
                     font=F_XS).pack(side="left", padx=(SP2, SP3))
            for _lbl, _dd in ((L("today", "\u0986\u099c"), 0),):
                tk.Button(_srow, text=_lbl, font=F_XS, relief="flat",
                          bd=0, cursor="hand2", bg=pc["ctrl_bg"], fg=fg,
                          padx=SP2, pady=3, highlightthickness=0,
                          command=lambda: _sv.set(str(date.today()))
                          ).pack(side="left")

            _err = tk.Label(_ed, text="", bg=card, fg=self.T("RED"),
                            font=F_XS, anchor="w")
            _err.pack(fill="x", padx=SP5, pady=(SP2, 0))

            def _apply():
                try:
                    _st = date.fromisoformat(_sv.get().strip())
                except Exception:
                    _err.config(text=L("That is not a date — use 2026-09-05.",
                                       "\u09a4\u09be\u09b0\u09bf\u0996 \u09b9\u09af\u09bc\u09a8\u09bf \u2014 2026-09-05"))
                    return
                _n = self._parse_cycle_len(_lenv.get(), None)
                if _n is None:
                    _err.config(text=L(
                        "Between %d and %d days." % (self.CYCLE_MIN,
                                                     self.CYCLE_MAX),
                        "%d \u09a5\u09c7\u0995\u09c7 %d \u09a6\u09bf\u09a8" % (self.CYCLE_MIN,
                                                            self.CYCLE_MAX)))
                    return
                self._set_cycle(_st, _n)
                try:
                    _ed.grab_release()
                    _ed.destroy()
                except Exception:
                    pass
                _close(reopen=True)

            _eb = tk.Frame(_ed, bg=card)
            _eb.pack(pady=(SP4, SP5))
            tk.Button(_eb, text=L("Set cycle", "\u09b8\u09c7\u099f \u0995\u09b0\u09c1\u09a8"),
                      command=_apply, bg=acc, fg=_ink(acc),
                      font=F_SMALL_B, relief="flat", padx=SP5, pady=SP1,
                      cursor="hand2", bd=0).pack(side="left")

            def _ecancel():
                try:
                    _ed.grab_release()
                    _ed.destroy()
                except Exception:
                    pass
                try:
                    win.grab_set()
                except Exception:
                    pass
            tk.Button(_eb, text=L("Cancel", "\u09ac\u09be\u09a4\u09bf\u09b2"),
                      command=_ecancel, bg=card, fg=mut, font=F_SMALL,
                      relief="flat", padx=SP4, pady=SP1, cursor="hand2",
                      bd=0, activebackground=card,
                      activeforeground=acc).pack(side="left", padx=(SP2, 0))
            _ed.protocol("WM_DELETE_WINDOW", _ecancel)
            _ed.bind("<Escape>", lambda e: _ecancel())
            _ed.update_idletasks()
            try:
                _l2, _t2, _r2, _b2 = self._work_area()
            except Exception:
                _l2, _t2 = 0, 0
                _r2 = self.winfo_screenwidth()
                _b2 = self.winfo_screenheight()
            _x2, _y2 = self._centre_on_screen(self._measure(_ed, "width"),
                                              self._measure(_ed, "height"),
                                              (_l2, _t2, _r2, _b2))
            _ed.geometry("+%d+%d" % (_x2, _y2))
            try:
                _ed.lift()
                _ed.focus_force()
            except Exception:
                pass

        _bar = tk.Canvas(win, height=4, bg=pc["ctrl_bg"],
                         highlightthickness=0)
        _bar.pack(fill="x", padx=SP6, pady=(0, SP3))

        # The footer is packed NOW, side="bottom", before the scroll
        # region exists. Tk's packer hands out space in pack order, so a
        # fill/expand body packed first takes everything and leaves the
        # buttons whatever is left — which was nothing: Done came out
        # half a button tall, sliced off by the window edge. Reserving
        # the footer first makes that impossible rather than unlikely.
        _btns = tk.Frame(win, bg=card)
        _btns.pack(side="bottom", pady=(SP2, SP4))

        def _draw_bar(e=None):
            try:
                w = _bar.winfo_width()
                if w < 2:
                    return
                _bar.delete("all")
                _bar.create_rectangle(0, 0, w, 4, fill=pc["ctrl_bg"],
                                      outline="")
                if day > 0:
                    _bar.create_rectangle(0, 0,
                                          int(w * day / float(total)), 4,
                                          fill=acc, outline="")
            except Exception:
                pass
        _bar.bind("<Configure>", _draw_bar)

        # ── The six areas, in a scroll region ───────────────────────────
        # Six-line boxes made this dialog ~1000px tall. That is fine on a
        # 1080p desktop and unusable on a 768px laptop: the window cannot
        # shrink, it holds a modal grab, and Done would sit below the
        # screen edge — the app would look frozen. So the areas scroll
        # and the header and Done stay put, which is what a dialog taller
        # than its screen has to do.
        _sc = tk.Frame(win, bg=card)
        _sc.pack(fill="both", expand=True)
        _sc.columnconfigure(0, weight=1)
        _sc.rowconfigure(0, weight=1)
        _cv = tk.Canvas(_sc, bg=card, highlightthickness=0, bd=0)
        _cv.grid(row=0, column=0, sticky="nsew")
        _sb = tk.Scrollbar(_sc, orient="vertical", command=_cv.yview)
        _style_sb(_sc, card, _blend(card, self.T("TEXT3"), 0.5))
        _style_sb(_sb, card, _blend(card, self.T("TEXT3"), 0.5))
        _sb.grid(row=0, column=1, sticky="ns")
        _cv.configure(yscrollcommand=_sb.set)
        _areas = tk.Frame(_cv, bg=card)
        _aid = _cv.create_window((0, 0), window=_areas, anchor="nw")

        def _fit(e=None):
            try:
                _cv.configure(scrollregion=_cv.bbox("all"))
                _cv.itemconfigure(_aid, width=_cv.winfo_width())
            except Exception:
                pass
        _areas.bind("<Configure>", _fit)
        _cv.bind("<Configure>", _fit)

        def _wheel(e):
            try:
                _cv.yview_scroll(-1 if getattr(e, "delta", 0) > 0 else 1,
                                 "units")
            except Exception:
                pass
        for _seq in ("<MouseWheel>", "<Button-4>", "<Button-5>"):
            _cv.bind_all(_seq, lambda e: _wheel(e)
                         if win.winfo_exists() else None, add="+")

        data = self._q90_data()
        rows = {}
        open_area = {"k": None}

        def _preview(area_key):
            """One line, always.

            The outcome box is six lines now, so people type six lines
            into it — and the raw string went straight into this label,
            newlines and all. A collapsed row grew to six lines tall, the
            other five areas were pushed down, and the whole point of
            collapsing (see all six at a glance) was lost. Whitespace is
            collapsed BEFORE clipping, or the clip counts newlines as
            characters and truncates a one-word summary."""
            _a = data.get(area_key) or {}
            _o = " ".join(((_a.get("out") or "").split()))
            return _clip(_o, 46) if _o else L("\u2014 not set yet",
                                              "\u2014 \u098f\u0996\u09a8\u0993 \u09a8\u09be")

        def _set_open(area_key):
            """One open at a time. Six open bodies is the wall of boxes
            this layout exists to avoid."""
            open_area["k"] = area_key
            for _k, _r in rows.items():
                _on = (_k == area_key)
                _r["body"].pack(fill="x", padx=(SP5, SP6), pady=(0, SP3)) \
                    if _on else _r["body"].pack_forget()
                _r["chev"].config(text="\u25be" if _on else "\u25b8")
                _r["prev"].config(
                    text="" if _on else _preview(_k),
                    fg=mut)
                _r["rail"].config(bg=acc if _on else pc["border"])

        for _key, _name, _glyph, _sub in self._Q90_AREAS:
            _wrap = tk.Frame(_areas, bg=card)
            _wrap.pack(fill="x", padx=SP5)

            _hdr = tk.Frame(_wrap, bg=card, cursor="hand2")
            _hdr.pack(fill="x")
            _hdr.columnconfigure(2, weight=1)

            _rail = tk.Frame(_hdr, bg=pc["border"], width=3)
            _rail.grid(row=0, column=0, sticky="ns", padx=(0, SP2),
                       pady=2)
            _chev = tk.Label(_hdr, text="\u25b8", bg=card, fg=mut,
                             font=F_SMALL, cursor="hand2")
            _chev.grid(row=0, column=1)
            _nm = tk.Label(_hdr, text="%s  %s" % (_glyph, _name), bg=card,
                           fg=fg, font=F_BODY_B, anchor="w",
                           cursor="hand2")
            _nm.grid(row=0, column=2, sticky="w", padx=(SP2, SP3),
                     pady=6)
            _prev = tk.Label(_hdr, text="", bg=card, fg=mut, font=F_XS,
                             anchor="e", cursor="hand2")
            _prev.grid(row=0, column=3, sticky="e")

            _body = tk.Frame(_wrap, bg=card)
            tk.Label(_body, text=_sub, bg=card, fg=mut, font=F_XS,
                     anchor="w", justify="left").pack(fill="x",
                                                      pady=(0, SP2))

            _a = data.get(_key) or {}
            for _fk, _q, _hint, _lines in self._Q90_PROMPTS:
                tk.Label(_body, text=_q.replace("{n}", str(total)),
                         bg=card, fg=fg, font=F_SMALL_B,
                         anchor="w").pack(fill="x", pady=(SP2, 0))
                tk.Label(_body, text=_hint, bg=card, fg=mut, font=F_XS,
                         anchor="w", justify="left").pack(fill="x",
                                                          pady=(0, 2))
                # Height comes from the prompt, not a constant. This is
                # the box you write a plan for a quarter of your life in;
                # two lines said "one short sentence" and made you scroll
                # a field the size of a tooltip. 15px with a little
                # leading, because a writing surface is read at length —
                # the 13px used for UI labels is not the same job.
                _tb = tk.Text(_body, height=_lines, width=50,
                              bg=pc["ctrl_bg"],
                              fg=pc["input_fg"], font=(_F, -15),
                              relief="flat", insertbackground=pc["input_fg"],
                              padx=SP2, pady=SP2, wrap="word",
                              spacing1=1, spacing3=3)
                _tb.insert("1.0", _a.get(_fk, ""))
                _tb.pack(fill="x")

                # Save as you type — the same rule the weekly review had
                # to learn. A plan you can only keep by finishing in one
                # sitting is a plan you lose.
                def _save(e=None, _b=_tb, _ak=_key, _f=_fk):
                    _txt = _b.get("1.0", "end-1c")
                    self._q90_set(_ak, _f, _txt)
                    data.setdefault(_ak, {})[_f] = _txt
                    save_data(self)
                    if _f == "out":
                        _n, _t = self._q90_counts()
                        try:
                            _cnt.config(text="%d/%d %s" % (
                                _n, _t, L("areas set", "\u0995\u09cd\u09b7\u09c7\u09a4\u09cd\u09b0")))
                        except Exception:
                            pass
                _tb.bind("<FocusOut>", _save)
                _tb.bind("<KeyRelease>",
                         lambda e, _s=_save, _b=_tb, _n=_key + _fk:
                         self._debounced_save("q90_" + _n, 500, _s, _b))

            rows[_key] = {"body": _body, "chev": _chev, "prev": _prev,
                          "rail": _rail}
            for _w in (_hdr, _chev, _nm, _prev):
                _w.bind("<Button-1>",
                        lambda e, _k=_key: _set_open(
                            None if open_area["k"] == _k else _k))

        _cnt = _hd.grid_slaves(row=0, column=1)[0]

        # Open the first area with nothing in it — the next thing to do,
        # rather than always the first row.
        _first = next((k for k, _n, _g, _h in self._Q90_AREAS
                       if not ((data.get(k) or {}).get("out") or "").strip()),
                      self._Q90_AREAS[0][0])
        _set_open(_first)

        def _close(reopen=False):
            try:
                win.grab_release()
            except Exception:
                pass
            self._q90_win = None
            try:
                win.destroy()
            except Exception:
                pass
            # Changing the cycle changes every date, count and bar in
            # this window, so it is rebuilt rather than patched in nine
            # places — and rebuilding is how the panel link behind it
            # gets the new numbers too.
            if reopen:
                try:
                    self._apply_theme(self._mode)
                    self.after(60, self._show_quarter_plan)
                except Exception as _e:
                    log.debug("cycle reopen: %s", _e)

        tk.Button(_btns, text=L("Done", "\u09b6\u09c7\u09b7"), command=_close,
                  bg=acc, fg=_ink(acc), font=F_SMALL_B, relief="flat",
                  padx=SP5, pady=SP1, cursor="hand2", bd=0,
                  activebackground=self.T("GREEN2"),
                  activeforeground=_ink(self.T("GREEN2"))).pack(side="left")
        win.protocol("WM_DELETE_WINDOW", _close)
        win.bind("<Escape>", lambda e: _close())

        win.update_idletasks()
        _draw_bar()
        try:
            _l, _t, _r, _b = self._work_area()
        except Exception:
            _l, _t = 0, 0
            _r, _b = self.winfo_screenwidth(), self.winfo_screenheight()

        # A Canvas asks for almost nothing, so the window has to be told
        # how big its scrolling content actually is — otherwise the
        # dialog opens at the canvas's minimum and every area is behind a
        # scrollbar from the first frame.
        #
        # The cap is computed from the CHROME that has to share the
        # window with it — header, date row, progress bar, footer — and
        # not from a guessed constant. Guessing left ~450px of empty
        # canvas under six short rows AND still squeezed the footer,
        # because the guess was wrong in both directions at once.
        _areas.update_idletasks()
        win.update_idletasks()
        _chrome = (_hd.winfo_reqheight() + _dates.winfo_reqheight()
                   + _bar.winfo_reqheight() + _btns.winfo_reqheight()
                   + 44)                       # paddings between them
        _need_h = _areas.winfo_reqheight()
        _cap_h = max(240, (_b - _t) - 40 - _chrome)
        _cv.config(width=_areas.winfo_reqwidth(),
                   height=min(_need_h, _cap_h))
        win.update_idletasks()
        _fit()

        # Size explicitly, capped to the screen. Without the cap the
        # window keeps its full requested height and the buttons go under
        # the taskbar; with it the scroll region above absorbs the
        # difference. Height only — the width is content-driven and small
        # enough to always fit.
        _ww0 = self._measure(win, "width")
        _wh0 = self._measure(win, "height")
        _wh0 = min(_wh0, (_b - _t) - 40)
        win.resizable(False, True)
        win.minsize(_ww0, min(420, _wh0))
        win.geometry("%dx%d" % (_ww0, _wh0))
        win.update_idletasks()
        x, y = self._centre_on_screen(_ww0, _wh0, (_l, _t, _r, _b))
        win.geometry("%dx%d+%d+%d" % (_ww0, _wh0, x, y))

        def _replace(e=None):
            try:
                win.unbind("<Map>")
                _w2 = self._measure(win, "width")
                _h2 = min(self._measure(win, "height"), (_b - _t) - 60)
                _x, _y = self._centre_on_screen(_w2, _h2, (_l, _t, _r, _b))
                win.geometry("%dx%d+%d+%d" % (_w2, _h2, _x, _y))
            except Exception as _e:
                log.debug("q90 reposition: %s", _e)
        win.bind("<Map>", _replace)
        try:
            win.lift()
            win.focus_force()
        except Exception as _e:
            log.debug("q90 focus: %s", _e)

    # ── Settings ─────────────────────────────────────────────────────────────
    # ── Start with Windows ───────────────────────────────────────────────────
    # Uses the Windows Registry "Run" key (HKCU, per-user, no admin rights
    # needed) rather than a Startup-folder shortcut — it's the standard,
    # simplest mechanism, and `winreg` is Python's own stdlib module, so
    # this stays true to the app's zero-external-dependency design. All
    # operations are wrapped in try/except: a permissions error or a
    # non-Windows OS should degrade to "checkbox does nothing" rather
    # than crash Settings.
    _STARTUP_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
    _STARTUP_NAME = "TaskTrackerV3"

    def _startup_command(self):
        """The exact command line that should run at Windows login —
        prefers pythonw.exe (no console flash) and quotes the script
        path, matching how _open_life_os already launches its sibling
        app."""
        try:
            script = os.path.abspath(__file__)
        except NameError:
            script = os.path.abspath(sys.argv[0])
        py = sys.executable
        pyw = py.replace("python.exe", "pythonw.exe")
        if os.path.exists(pyw):
            py = pyw
        return f'"{py}" "{script}"'

    def _is_startup_enabled(self):
        if os.name != "nt":
            return False
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, self._STARTUP_KEY,
                                0, winreg.KEY_READ) as k:
                val, _ = winreg.QueryValueEx(k, self._STARTUP_NAME)
                return bool(val)
        except Exception:
            return False

    def _set_startup_enabled(self, enabled):
        """Add/remove the HKCU Run-key entry. Returns True on success so
        the caller can tell the user if it silently failed (e.g. locked-
        down corporate machine) instead of the checkbox just lying."""
        if os.name != "nt":
            return False
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, self._STARTUP_KEY,
                                0, winreg.KEY_SET_VALUE) as k:
                if enabled:
                    winreg.SetValueEx(k, self._STARTUP_NAME, 0,
                                      winreg.REG_SZ, self._startup_command())
                else:
                    try:
                        winreg.DeleteValue(k, self._STARTUP_NAME)
                    except FileNotFoundError:
                        pass
            return True
        except Exception as e:
            log.error("startup registry write failed: %s", e)
            return False

    # ── Settings dialog widgets ─────────────────────────────────────────────
    def _mk_toggle(self, parent, var, bg):
        """Canvas-drawn toggle. Tk's Checkbutton uses OS chrome that no
        styling can override, so a modern switch must be drawn by hand."""
        acc, off = self.T("GREEN"), _PANEL_COLORS[self._mode]["border"]
        cv = tk.Canvas(parent, width=44, height=24, bg=bg,
                       highlightthickness=0, cursor="hand2")

        def draw():
            cv.delete("all")
            on = bool(var.get())
            _round_rect(cv, 1, 3, 43, 21, 9, fill=acc if on else off)
            x = 32 if on else 12
            cv.create_oval(x - 8, 4, x + 8, 20, fill="#FFFFFF", outline="")
        cv.bind("<Button-1>", lambda e: (var.set(not var.get()), draw()))
        draw()
        return cv

    def _mk_stepper(self, parent, var, lo, hi, bg, suffix="", fmt=None):
        """[-] value [+]. Replaces tk.Spinbox, whose tiny stacked arrows
        are dated and an awkward click target."""
        pc = _PANEL_COLORS[self._mode]
        # ctrl_bg is lighter than card2 on all themes (including WARROOM where
        # input_bg is *darker* than card2 and would disappear on a dialog surface).
        ctrl = pc["ctrl_bg"]
        f = tk.Frame(parent, bg=bg, highlightthickness=1,
                     highlightbackground=pc["ctrl_bd"])
        lbl = tk.Label(f, width=7, bg=ctrl, fg=pc["input_fg"],
                       font=F_SMALL_B, pady=4)

        def show():
            lbl.config(text=fmt(var.get()) if fmt
                       else f"{var.get()}{suffix}")

        def bump(d):
            var.set(max(lo, min(hi, var.get() + d)))
            show()
        for txt, d in (("\u2212", -1), ("+", 1)):
            b = tk.Button(f, text=txt, width=2, bg=ctrl,
                          fg=self.T("GREEN"), font=F_SMALL_B, relief="flat",
                          bd=0, cursor="hand2", activebackground=pc["active_btn"],
                          command=lambda d=d: bump(d))
            b.pack(side="left" if d < 0 else "right", padx=1)
            self._press_depth(b)
        lbl.pack(side="left", padx=1)
        show()
        return f

    def _show_settings(self):
        """Grouped settings — Appearance / Schedule / Productivity /
        System. Was one flat list of 11 rows, so related options (the
        four day-phase hours) sat no closer than unrelated ones."""
        pc = _PANEL_COLORS[self._mode]
        acc = self.T("GREEN")
        card, fg, mut = pc["card2"], pc["menu_fg"], pc["muted"]
        st = self._settings
        # ── Scrollable body + pinned footer ──────────────────────────────────
        # The dialog used to grow to whatever height its rows needed and
        # was then merely CENTRED on screen — nothing clamped it to the
        # monitor. Every settings row added over time pushed the Save
        # button further down, and it eventually ended up underneath the
        # Windows taskbar: the one control you must reach was the one you
        # couldn't. A settings dialog can't be allowed to outgrow the
        # screen, so the rows now scroll and Save is pinned to the bottom
        # where it can never be pushed off.
        #
        # `top` is the real Toplevel; `win` is the inner frame every row
        # grids into. Naming the inner frame `win` keeps ~40 existing
        # `tk.Label(win, ...)` / `_mk_toggle(win, ...)` calls below
        # working untouched — the alternative was re-parenting all of
        # them, which is a lot of churn for no behaviour change.
        top = tk.Toplevel(self)
        top.title("Settings")
        top.configure(bg=card)
        top.transient(self)
        top.resizable(False, False)
        try:
            top.grab_set()
        except Exception:
            pass
        top.columnconfigure(0, weight=1)
        top.rowconfigure(0, weight=1)

        _body_cv = tk.Canvas(top, bg=card, highlightthickness=0, bd=0)
        _body_cv.grid(row=0, column=0, sticky="nsew")
        _body_sb = tk.Scrollbar(top, orient="vertical", width=10,
                                command=_body_cv.yview)
        _style_sb(_body_sb, card, _blend(card, self.T("TEXT3"), 0.5))
        _body_cv.configure(yscrollcommand=_body_sb.set)

        win = tk.Frame(_body_cv, bg=card)
        _body_id = _body_cv.create_window((0, 0), window=win, anchor="nw")
        win.bind("<Configure>",
                 lambda e: _body_cv.configure(
                     scrollregion=_body_cv.bbox("all")))
        _body_cv.bind("<Configure>",
                      lambda e: _body_cv.itemconfig(_body_id, width=e.width))

        # Fixed label column = every control on the same vertical line.
        win.columnconfigure(0, minsize=200)
        win.columnconfigure(1, weight=1, minsize=330)

        r = 0

        def head(text, sub=None):
            nonlocal r
            tk.Label(win, text=text, bg=card, fg=acc, font=F_H1, anchor="w"
                     ).grid(row=r, column=0, columnspan=2, sticky="w",
                            padx=SP5, pady=(SP5, 0))
            r += 1
            if sub:
                tk.Label(win, text=sub, bg=card, fg=mut, font=F_XS, anchor="w"
                         ).grid(row=r, column=0, columnspan=2, sticky="w",
                                padx=SP5, pady=(1, SP2))
                r += 1

        def section(text):
            nonlocal r
            tk.Frame(win, bg=pc["border"], height=1).grid(
                row=r, column=0, columnspan=2, sticky="ew", padx=SP5,
                pady=(SP4, 0))
            r += 1
            tk.Label(win, text=text, bg=card, fg=fg, font=F_SMALL_B, anchor="w"
                     ).grid(row=r, column=0, columnspan=2, sticky="w",
                            padx=SP5, pady=(SP2, 2))
            r += 1

        def row(label, widget):
            nonlocal r
            tk.Label(win, text=label, bg=card, fg=fg, font=F_SMALL, anchor="w"
                     ).grid(row=r, column=0, sticky="w", padx=(SP6, SP3),
                            pady=6)
            widget.grid(row=r, column=1, sticky="w", padx=(0, SP5), pady=6)
            r += 1

        # Section labels carry no emoji. The five that used to sit here
        # were multi-colour bitmaps running down the left edge of a
        # dialog whose entire job is to look calm, and not one of them
        # could follow the theme colour.
        head("SETTINGS",
             "Customize Task Tracker to match your workflow.")

        # ── Appearance ───────────────────────────────────────────────────────
        section("Appearance")
        theme_v = tk.StringVar(value=self._mode)
        tf = tk.Frame(win, bg=card)
        # Local to THIS dialog — a module-level list would keep painters
        # from closed windows and fire them at destroyed widgets.
        _paint = []

        def _repaint():
            for fn in _paint:
                fn()
        for _tm in THEME_ORDER:
            rw = tk.Frame(tf, bg=card, cursor="hand2")
            rw.pack(anchor="w", pady=2, fill="x")
            dot = tk.Canvas(rw, width=14, height=14, bg=card,
                            highlightthickness=0)
            dot.pack(side="left", padx=(0, 6))
            name = tk.Label(rw, text=THEMES[_tm]["THEME_LABEL"], bg=card,
                            fg=fg, font=F_SMALL, width=10, anchor="w")
            name.pack(side="left")
            # Swatch: the theme's own colours, judged before applying.
            sw = tk.Canvas(rw, width=64, height=12, bg=card,
                           highlightthickness=0)
            sw.pack(side="left")
            for i, ck in enumerate(("BG", "CARD_BG", "GREEN", "TEXT")):
                # ctrl_bd outline ensures near-black TEXT swatches stay
                # visible on the WARROOM dark dialog surface.
                sw.create_rectangle(i * 16, 0, i * 16 + 15, 12,
                                    fill=THEMES[_tm][ck], outline=pc["ctrl_bd"])

            def paint(_dot=dot, _tm=_tm):
                on = theme_v.get() == _tm
                _dot.delete("all")
                _dot.create_oval(1, 1, 13, 13, width=2,
                                 outline=acc if on else pc["border"])
                if on:
                    _dot.create_oval(4, 4, 10, 10, fill=acc, outline="")
            for w in (rw, dot, name, sw):
                w.bind("<Button-1>",
                       lambda e, t=_tm: (theme_v.set(t), _repaint()))
            _paint.append(paint)
            paint()
        row("Theme", tf)

        lang_v = tk.StringVar(value=st.get("lang", "en"))
        lf = tk.Frame(win, bg=card)
        _lbtns = {}

        def lang_paint():
            for k, b in _lbtns.items():
                on = lang_v.get() == k
                b.config(bg=acc if on else pc["ctrl_bg"],
                         fg=_ink(acc) if on else fg)
        for val, txt in (("en", "English"), ("bn", "\u09ac\u09be\u0982\u09b2\u09be")):
            b = tk.Button(lf, text=txt, font=F_SMALL, relief="flat", bd=0,
                          cursor="hand2", padx=SP4, pady=3,
                          command=lambda v=val: (lang_v.set(v), lang_paint()))
            b.pack(side="left", padx=(0, 4))
            _lbtns[val] = b
        lang_paint()
        row("Language", lf)

        # Off by default — see the long note in _draw_clock_face on why
        # the dial stopped being the default rather than being deleted.
        analog_v = tk.BooleanVar(value=bool(st.get("analog_clock", False)))
        row("Analog clock face", self._mk_toggle(win, analog_v, card))

        # ── Time tracking ────────────────────────────────────────────────────
        section("Time tracking")
        autot_v = tk.BooleanVar(
            value=bool(st.get("auto_timer_on_open", True)))
        row("Start timer when I open a project",
            self._mk_toggle(win, autot_v, card))
        idle_v = tk.IntVar(value=int(st.get("idle_stop_min", 15)))
        row("Stop after idle (minutes)",
            self._mk_stepper(win, idle_v, 2, 120, card, " min"))

        # ── Schedule ─────────────────────────────────────────────────────────
        section("Schedule")
        _pv = {}
        for key, lbl, dv in (("phase_morning_start", "Morning starts", 5),
                             ("phase_work_start", "Work starts", 9),
                             ("phase_evening_start", "Evening starts", 18),
                             ("phase_sleep_start", "Sleep starts", 23)):
            _pv[key] = tk.IntVar(value=int(st.get(key, dv)))
            # 12-hour with AM/PM, because that is what every other screen
            # shows. Settings said "18:00" and "23:00" while the PLAN
            # bars right next to it said "6:00 PM" and "11:00 PM" — the
            # same four numbers written two ways, and midnight appeared
            # as the frankly cryptic "0:00".
            row(lbl, self._mk_stepper(
                win, _pv[key], 0, 23, card,
                fmt=lambda h: "%d:00 %s" % (h % 12 or 12,
                                            "AM" if h < 12 else "PM")))

        # ── Productivity ─────────────────────────────────────────────────────
        section("Productivity")
        # Two rows used to live here and NEITHER of them did anything.
        #
        # "PLAN daily goal" was read by _goal_secs — but only as a
        # FALLBACK, for when no project has been named. Name one project
        # and the goal becomes the sum of the project targets instead, so
        # for anybody actually using the app this stepper moved a number
        # that was never read again. A control that does nothing is worse
        # than no control: it teaches you not to trust the panel.
        #
        # "FOCUS daily goal" fed a progress bar that the NOW / MIT /
        # TASK LIST redesign removed from the panel. Nothing displays
        # focus_progress_secs any more, so its target had nothing to be
        # a target for.
        #
        # What replaces them is the truth: the goal, and where it comes
        # from. You change it by changing a project's daily target — on
        # its card, or in PLAN's Consistency tab.
        gh_v = tk.IntVar(value=int(st.get("goal_hours", 5)))
        _named = []
        try:
            _named = self._named_projects()
        except Exception as _e:
            log.debug("settings goal: %s", _e)
        if _named:
            _g = self._goal_secs()
            _gf = tk.Frame(win, bg=card)
            tk.Label(_gf, text="%dh %02dm" % (int(_g // 3600),
                                              int(_g % 3600 // 60)),
                     bg=card, fg=fg, font=F_SMALL_B).pack(side="left")
            tk.Label(_gf, text="  = your %d project targets added up"
                            % len(_named),
                     bg=card, fg=pc["sec_text"], font=F_XS).pack(side="left")
            row("Daily goal", _gf)
        else:
            row("Daily goal", self._mk_stepper(win, gh_v, 1, 12, card, " h"))
        # NO separate "Working hours" row. It set work_start/work_end,
        # which duplicated "Work starts" / "Evening starts" in Schedule
        # above \u2014 two controls for one concept, free to contradict each
        # other. work_start was never read by anything at all, and
        # work_end's single reader (the FOCUS "TODAY" countdown) now uses
        # the phase bounds instead. Keeping a control that no longer
        # changes anything would be worse than removing it.

        # ── System ───────────────────────────────────────────────────────────
        section("System")
        cur_v = tk.StringVar(value=st.get("currency", "$"))
        row("Currency symbol",
            tk.Entry(win, textvariable=cur_v, width=6, bg=pc["ctrl_bg"],
                     fg=pc["input_fg"], relief="flat", font=F_SMALL,
                     insertbackground=pc["input_fg"],
                     highlightthickness=1, highlightbackground=pc["ctrl_bd"]))
        startup_v = tk.BooleanVar(value=self._is_startup_enabled())
        if os.name == "nt":
            row("Start with Windows", self._mk_toggle(win, startup_v, card))
        else:
            row("Start with Windows",
                tk.Label(win, text="Windows-only", bg=card, fg=mut, font=F_XS))

        # ── More — links that used to crowd the ⚙ tools menu ─────────────────
        # About / Export / Shortcuts are occasional-use, not daily-use;
        # parking them here keeps the gear menu focused on the actual tools.
        section("More")

        def _link_row(label_txt, desc_txt, cmd):
            nonlocal r
            _lk = tk.Button(win, text=label_txt, command=cmd,
                            bg=card, fg=acc, font=F_SMALL_B, relief="flat",
                            bd=0, cursor="hand2", anchor="w", padx=0,
                            activebackground=card, activeforeground=acc)
            _lk.grid(row=r, column=0, sticky="w", padx=(SP6, SP3), pady=4)
            tk.Label(win, text=desc_txt, bg=card, fg=mut, font=F_XS,
                     anchor="w").grid(row=r, column=1, sticky="w",
                                      padx=(0, SP5), pady=4)
            r += 1

        # These close the DIALOG (top), not the inner scroll frame (win).
        _link_row("⌨  Keyboard Shortcuts",
                  "Every shortcut at a glance  ·  ?",
                  lambda: (top.destroy(), self._show_shortcuts_panel()))
        _link_row("⬇  Export Data",
                  "One-click JSON backup + CSV",
                  lambda: (top.destroy(), self._export_data()))
        _link_row("ℹ  About",
                  "Version " + APP_VERSION + " · updates · contact",
                  lambda: (top.destroy(), self._show_about()))

        def _apply():
            try:
                st["lang"] = lang_v.get()
                st["currency"] = (cur_v.get().strip() or "$")[:4]
                st["goal_hours"] = max(1, min(12, int(gh_v.get())))
                st["analog_clock"] = bool(analog_v.get())
                st["auto_timer_on_open"] = bool(autot_v.get())
                st["idle_stop_min"] = max(2, min(120, int(idle_v.get())))
                for k, v in _pv.items():
                    st[k] = max(0, min(23, int(v.get())))
            except Exception as e:
                log.debug("settings apply: %s", e)
            if os.name == "nt":
                if not self._set_startup_enabled(startup_v.get()):
                    from tkinter import messagebox
                    messagebox.showwarning(
                        "Startup setting",
                        "Couldn't update the Windows startup entry "
                        "(permissions?). Other settings were still saved.",
                        parent=top)
            save_data(self)
            try:
                top.destroy()
            except Exception:
                pass
            if theme_v.get() != self._mode:
                self._apply_theme(theme_v.get())     # rebuilds everything
            else:
                try:
                    self._update_progress_bar()
                    self._update_insights()
                    self._draw_phase_bars()
                except Exception:
                    pass

        # Bottom padding inside the scroll area so the last row never
        # sits flush against the footer rule.
        tk.Frame(win, bg=card, height=SP4).grid(row=r, column=0, columnspan=2)
        r += 1

        # \u2500\u2500 Footer \u2014 always visible, outside the scrolling area \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
        footer = tk.Frame(top, bg=card)
        footer.grid(row=1, column=0, columnspan=2, sticky="ew")
        tk.Frame(footer, bg=pc["border"], height=1).pack(fill="x")
        _sb = tk.Frame(footer, width=200, height=42, bg=card)
        _sb.pack(pady=(SP4, SP4))
        _sb.pack_propagate(False)
        _save = tk.Button(_sb, text="Save Settings  \u2713", command=_apply,
                          bg=acc, fg="#FFFFFF", font=F_SMALL_B, relief="flat",
                          cursor="hand2", bd=0,
                          activebackground=self.T("GREEN2"),
                          activeforeground="#FFFFFF")
        _save.pack(fill="both", expand=True)
        self._press_depth(_save)
        # Enter saves, Esc closes \u2014 a dialog you can finish without the
        # mouse, and the same two keys every OS dialog uses.
        top.bind("<Return>", lambda e: _apply())
        top.bind("<Escape>", lambda e: top.destroy())

        # \u2500\u2500 Size to content, but never past the screen \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
        top.update_idletasks()
        _need_h = win.winfo_reqheight() + footer.winfo_reqheight()
        _need_w = win.winfo_reqwidth()
        try:
            _wl, _wt, _wr, _wb = self._work_area()
            _avail_h = (_wb - _wt) - 80          # leave room for the title bar
        except Exception:
            _avail_h = self.winfo_screenheight() - 140
        _h = min(_need_h, max(320, _avail_h))
        # Scrollbar only appears when the content actually overflows \u2014
        # a permanently-visible empty track on a short dialog is noise.
        if _need_h > _h:
            _body_sb.grid(row=0, column=1, sticky="ns")
            _need_w += 12
        x = self.winfo_rootx() + (self.winfo_width() - _need_w) // 2
        y = self.winfo_rooty() + (self.winfo_height() - _h) // 2
        top.geometry(f"{_need_w}x{_h}+{max(x, 20)}+{max(y, 20)}")

    # ── One-click data export (JSON backup + CSV) ────────────────────────────
    def _export_data(self):
        """Write full JSON backup + CSV (tasks & daily history) to a folder."""
        from tkinter import messagebox
        folder = filedialog.askdirectory(title="Choose export folder")
        if not folder:
            return
        import csv as _csv
        import datetime as _dt
        stamp = _dt.datetime.now().strftime("%Y%m%d_%H%M%S")
        try:
            self._record_today()
            save_data(self)
            jpath = os.path.join(folder, f"task_tracker_backup_{stamp}.json")
            with open(DATA_FILE, encoding="utf-8") as src, \
                    open(jpath, "w", encoding="utf-8") as dst:
                dst.write(src.read())
            cpath = os.path.join(folder, f"task_tracker_export_{stamp}.csv")
            with open(cpath, "w", newline="", encoding="utf-8-sig") as f:
                wcsv = _csv.writer(f)
                wcsv.writerow(["type", "date", "text", "done",
                               "seconds", "estimate_min", "mit"])
                for _src, _lst in (("task_classic", self.tasks),
                                   ("task_focus", self.tasks_focus)):
                    for t in _lst:
                        wcsv.writerow([_src, t.get("added_date", ""),
                                       t.get("text", ""), t.get("done", False),
                                       int(t.get("secs", 0)),
                                       t.get("est", 0), t.get("mit", False)])
                for d in sorted(self._daily_history):
                    h = self._daily_history[d]
                    wcsv.writerow(["day", d, "", "",
                                   int(h.get("secs", 0)), "",
                                   h.get("done", 0)])
            messagebox.showinfo("Export complete",
                                f"Saved:\n{os.path.basename(jpath)}\n"
                                f"{os.path.basename(cpath)}", parent=self)
        except Exception as e:
            log.error("export failed: %s", e)
            messagebox.showerror("Export failed", str(e), parent=self)

    # ── About ────────────────────────────────────────────────────────────────
    def _show_about(self):
        pc = _PANEL_COLORS[self._mode]
        acc = self.T("GREEN")
        win = tk.Toplevel(self)
        win.title("About")
        win.configure(bg=pc["card2"])
        win.transient(self)
        win.resizable(False, False)
        tk.Label(win, text="◎", bg=pc["card2"], fg=acc,
                 font=(_F, 30)).pack(pady=(SP5, 0))
        tk.Label(win, text="TASK TRACKER", bg=pc["card2"], fg=pc["menu_fg"],
                 font=F_H1).pack()
        tk.Label(win, text=f"Version {APP_VERSION}", bg=pc["card2"],
                 fg=pc["sec_text"], font=F_SMALL).pack(pady=(SP1, 0))
        # Positioning: built on real cognitive-science mechanisms (not
        # just "yet another to-do app") — the Zeigarnik effect keeps
        # unfinished tasks visibly nagging until done, MIT forces one
        # priority instead of an overwhelming list, time-boxing fights
        # Parkinson's Law. That combination is exactly what tends to
        # help with task-paralysis / executive-function struggles, so
        # it's said plainly here rather than left implicit.
        tk.Label(win, text="Built on real focus psychology, not gamified guilt",
                 bg=pc["card2"], fg=pc["muted"], font=F_XS).pack(pady=(SP1, 0))
        tk.Label(win, text="Zeigarnik effect · one MIT at a time · time-boxing",
                 bg=pc["card2"], fg=pc["muted"], font=F_XS).pack(pady=(0, SP3))
        upd = tk.Label(win, text="", bg=pc["card2"], fg=acc, font=F_XS)
        upd.pack()

        def _check():   # placeholder for a future update service
            upd.config(text=f"✓ You're on the latest version ({APP_VERSION})")
        tk.Button(win, text="Check for Updates", command=_check,
                  bg=pc["ctrl_bg"], fg=pc["menu_fg"], font=F_SMALL_B,
                  relief="flat", padx=SP4, pady=SP1, cursor="hand2",
                  bd=0).pack(pady=SP2)
        tk.Label(win, text=f"Contact: {APP_CONTACT}", bg=pc["card2"],
                 fg=pc["sec_text"], font=F_XS).pack(pady=(SP2, SP5), padx=SP6)
        win.bind("<Escape>", lambda e: win.destroy())
        win.update_idletasks()
        x = self.winfo_rootx() + (self.winfo_width() - win.winfo_width()) // 2
        y = self.winfo_rooty() + (self.winfo_height() - win.winfo_height()) // 2
        win.geometry(f"+{max(x, 20)}+{max(y, 20)}")

    # ── Progressive panel layout — compact (widget-style) by default ────────
    # compact: panel 3 only (sidebar widget, ~560px — sit it on one edge of
    #          the screen and keep working elsewhere without distraction).
    # partial: panel 2 + 3 (goals visible too).
    # full:    all 3 panels (the original layout).
    # Two on-screen chevron arrows step through these one at a time;
    # Ctrl+F jumps straight between compact and full.
    _LAYOUT_ORDER = ["compact", "partial", "full"]

    def _mk_corner_settings_btn(self, parent):
        """Gear button pinned to panel 3's top-right corner — now the
        home for the full tools list (Life Execution Board, Finance
        Tracker, Goal Step, etc. — including Settings itself, still the
        last item in that menu), moved here from the "+ Tools" pill.
        Mirrors _mk_layout_arrow's top-left pin so both corner controls
        read as the same "small persistent control" pattern."""
        pc = _PANEL_COLORS[self._mode]
        b = tk.Button(parent, text="⚙",
                      bg=pc["input_bg"], fg=self.T("GREEN"),
                      font=(_F, 10, "bold"), relief="flat", bd=0,
                      padx=3, pady=0, cursor="hand2",
                      activebackground=pc["active_btn"],
                      activeforeground=self.T("GREEN"))
        b.config(command=lambda: self._show_tools_menu(b))
        b.place(relx=1.0, x=-2, y=1, anchor="ne")
        _hover(b, pc["input_bg"], pc["active_btn"])
        self._press_depth(b)
        return b

    def _mk_layout_arrow(self, parent, cmd):
        """Small chevron button, pinned to a panel's top-left corner, that
        steps the progressive layout one notch in the given direction."""
        # Small, corner-sized so it never crowds the panel's own header —
        # exact pixel offset is a best-effort guess pending visual check.
        pc = _PANEL_COLORS[self._mode]
        b = tk.Button(parent, text="◀", command=cmd,
                      bg=pc["input_bg"], fg=self.T("GREEN"),
                      font=(_F, -12, "bold"), relief="flat", bd=0,
                      padx=2, pady=0, cursor="hand2",
                      activebackground=pc["active_btn"],
                      activeforeground=self.T("GREEN"))
        b.place(x=1, y=1)
        _hover(b, pc["input_bg"], pc["active_btn"])
        self._press_depth(b)
        return b

    def _toggle_panel2(self):
        """Panel-3's arrow — show/hide panels 1 & 2 (projects + goals)
        together. A real toggle: direction depends on the CURRENT
        visibility, not a fixed step (a fixed step is what broke this
        from the default 'compact' state — direction=-1 from idx 0
        clamps to 0 forever)."""
        target = "compact" if self._panel_layout in ("partial", "full") else "full"
        self._set_panel_layout(target)

    def _toggle_panel1(self):
        """Panel-2's arrow — show/hide panel 1 (projects). Only reachable
        while panel 2 is already visible (partial or full)."""
        target = "partial" if self._panel_layout == "full" else "full"
        self._set_panel_layout(target)

    def _toggle_focus_mode(self):
        """Ctrl+F — jump straight between compact (task-only) and full."""
        target = "compact" if self._panel_layout == "full" else "full"
        self._set_panel_layout(target)

    def _set_panel_layout(self, layout):
        if layout not in self._LAYOUT_ORDER or layout == self._panel_layout:
            return
        self._panel_layout = layout
        self._settings["panel_layout"] = layout
        self._apply_panel_layout(layout, resize=True)
        save_data(self)

    _DOCK_MARGIN = 0    # px gap between panel 3 and the screen edge — the
    # window docks flush to the right edge

    def _work_area(self):
        """(left, top, right, bottom) of the usable desktop — i.e. the
        screen MINUS the taskbar — for the MONITOR THIS WINDOW IS ON.

        Docking flush to the top/right needs the WORK area, not the raw
        screen size. SPI_GETWORKAREA only ever reports the PRIMARY
        monitor's work area though — on a multi-monitor setup, or once
        this window has been dragged to a secondary display, that
        silently returns the wrong rectangle and the taskbar ends up
        overlapping the bottom of the window. MonitorFromPoint (using
        the window's own top-left corner) finds the monitor actually
        under the window; GetMonitorInfoW then gives that monitor's
        real work area. Falls back to SPI_GETWORKAREA (old behavior) if
        the per-monitor lookup doesn't return a usable rect. Windows
        reports both via ctypes, which is stdlib (the app already uses
        it for DPI awareness)."""
        try:
            sw, sh = self.winfo_screenwidth(), self.winfo_screenheight()
        except Exception:
            sw, sh = 1920, 1080
        if os.name == "nt":
            try:
                import ctypes

                class _R(ctypes.Structure):
                    _fields_ = [("left", ctypes.c_long), ("top", ctypes.c_long),
                                ("right", ctypes.c_long), ("bottom", ctypes.c_long)]

                class _PT(ctypes.Structure):
                    _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]

                class _MONINFO(ctypes.Structure):
                    _fields_ = [("cbSize", ctypes.c_ulong), ("rcMonitor", _R),
                                ("rcWork", _R), ("dwFlags", ctypes.c_ulong)]

                MONITOR_DEFAULTTONEAREST = 2
                pt = _PT(self.winfo_rootx(), self.winfo_rooty())
                mon = ctypes.windll.user32.MonitorFromPoint(
                    pt, MONITOR_DEFAULTTONEAREST)
                info = _MONINFO()
                info.cbSize = ctypes.sizeof(_MONINFO)
                if ctypes.windll.user32.GetMonitorInfoW(mon, ctypes.byref(info)):
                    w = info.rcWork
                    if w.right > w.left and w.bottom > w.top:
                        return w.left, w.top, w.right, w.bottom
                # Per-monitor lookup returned nothing usable — fall back
                # to the primary-monitor API rather than guessing a margin.
                r = _R()
                # SPI_GETWORKAREA = 0x0030
                if ctypes.windll.user32.SystemParametersInfoW(
                        0x0030, 0, ctypes.byref(r), 0):
                    if r.right > r.left and r.bottom > r.top:
                        return r.left, r.top, r.right, r.bottom
            except Exception as e:
                log.debug("work area query failed: %s", e)
        # Non-Windows / query failed: assume a bottom taskbar-ish strip.
        return 0, 0, sw, max(400, sh - 48)

    def _frame_overhead(self):
        """Height of the title bar + window border, in px.

        tk's geometry("WxH+X+Y") sets the CLIENT area to H but positions
        the OUTER frame at Y — so the real bottom edge is Y + titlebar +
        H. Handing it the full work-area height therefore pushes the
        bottom of the window under the taskbar by exactly the title bar's
        height, which is why the last rows were being cut off. Measured
        live (rooty is the client top, y is the frame top) rather than
        hardcoded, since it varies with DPI and Windows version."""
        try:
            d = self.winfo_rooty() - self.winfo_y()
            if 0 < d < 200:
                return d
        except Exception:
            pass
        return 32   # sane default before the window is first mapped

    def _dock_geometry(self, target_w):
        """Deterministic geometry string for `target_w` — ALWAYS derived
        fresh from the monitor's own work area, never from a previous
        window position. This replaced an earlier delta-based approach
        (new_x = old_x + old_w - target_w) that kept drifting: reading
        back "old" geometry was fragile — stale saved state, timing
        around update_idletasks, etc. all fed wrong deltas in. A pure
        function of (work area, target width) can't drift, because there
        is no history for it to get wrong."""
        l, top, right, bottom = self._work_area()
        h = max(400, bottom - top - self._frame_overhead())
        x = max(l, right - target_w - self._DOCK_MARGIN)
        return f"{target_w}x{h}+{x}+{top}"

    def _redock(self, geo):
        """Re-assert a geometry a moment after setting it.

        Guarded on two things the raw `self.geometry(g)` lambda was not:
        the window still existing (a timer surviving app close raised
        TclError into the log), and the layout not having changed again
        in the meantime — a re-assert for a layout you already left is
        exactly the bug this pair of timers used to cause."""
        try:
            if not self.winfo_exists():
                return
            if self._dock_geometry(self._layout_width()) != geo:
                return
            self.geometry(geo)
        except Exception as _e:
            log.debug("redock: %s", _e)

    def _layout_width(self, layout=None):
        """Target window width for a layout — THE definition, used by the
        initial dock, the arrow clicks and the delayed re-assert.

        "full" means the monitor's work area, not a remembered number:
        panel 3 has a minsize, so any width short of the screen gets
        taken out of panels 1 and 2 — the two that actually needed it."""
        layout = layout or getattr(self, "_panel_layout", "compact")
        try:
            _wl, _wt, _wr, _wb = self._work_area()
            _avail = (_wr - _wl) - (self._DOCK_MARGIN * 2)
        except Exception:
            _avail = _FULL_W_FLOOR
        return {"compact": _PANEL3_W + 40, "partial": 1280,
                "full": max(_FULL_W_FLOOR, _avail)}.get(
                    layout, _PANEL3_W + 40)

    def _apply_panel_layout(self, layout, resize=True):
        """Show/hide panels 1 & 2 via grid_remove (state is preserved,
        nothing is destroyed) and dock the window to match — so a
        collapsed layout is an actually-narrow window pinned to the
        right edge of the screen, not empty space with a wandering
        position."""
        try:
            show_p1 = (layout == "full")
            show_p2 = (layout in ("full", "partial"))

            if show_p1:
                self._panel_projects.grid()
                self._sep1.grid()
            else:
                self._panel_projects.grid_remove()
                self._sep1.grid_remove()

            if show_p2:
                self._panel_goals.grid()
                self._sep2.grid()
            else:
                self._panel_goals.grid_remove()
                self._sep2.grid_remove()

            # Two ratios, both keeping panel 3 at 50:
            #   full    (panel 1 + 2 + 3): 67 : 83 : 50
            #   partial (panel 2 + 3 only): -- : 85 : 50
            # Panel 2 gets slightly more of the split when panel 1 isn't
            # there to share space with, which is why its weight isn't
            # identical across the two states.
            # uniform must be on whenever ANY flexible panel shows, so
            # the shared weight scale actually applies; it's off only in
            # "compact" (both hidden) so panel 3 can freely take the
            # whole window via weight=1 uniform-less that.
            _both = show_p1 and show_p2
            _any = show_p1 or show_p2
            _u = "panels" if _any else ""
            self.columnconfigure(0, uniform=_u, weight=67 if show_p1 else 0)
            self.columnconfigure(1, uniform=_u,
                                 weight=(83 if _both else 85) if show_p2 else 0)
            self.columnconfigure(2, uniform=_u, minsize=_PANEL3_W + _PANEL_GAP,
                                 weight=50 if show_p2 else 1)
            self._panel_clock.grid_configure(sticky="nsew")

            # Arrow icons reflect what THIS click would do next.
            #
            # In its OWN try, and via _alive rather than hasattr. This
            # block used to sit bare in the middle of the method, so a
            # stale reference to a destroyed arrow raised TclError, the
            # outer except swallowed it, and everything BELOW — the
            # window resize — was skipped. The panels really did hide;
            # the window just stayed full-screen wide with a blank half.
            # A cosmetic glyph update has no business being able to do
            # that.
            for _attr, _shown in (("_arrow_p1", show_p1),
                                  ("_arrow_p2", show_p2)):
                _a = self._alive(_attr)
                if _a is not None:
                    try:
                        _a.config(text="▶" if _shown else "◀")
                    except Exception as _e:
                        log.debug("layout arrow: %s", _e)

            if resize:
                # ── "full" means the whole work area ────────────────────
                # It used to mean 1600px, or whatever width was last
                # saved. On a 1920-wide screen that left ~320px of
                # desktop unused while panels 1 and 2 were visibly
                # cramped — and panel 3 has a minsize (_PANEL3_W), so it
                # never gave any of that shortfall back. The squeeze
                # landed entirely on the two flexible panels: panel 3
                # has the SMALLEST weight (50) yet was taking the MOST
                # space, because a minsize outranks a weight.
                #
                # Deriving the width from the monitor instead means the
                # extra ~300px goes where the weights say it should, and
                # "full" stops being a number that was right for one
                # screen size. _FULL_W_FLOOR still applies underneath so
                # a small monitor can't collapse the layout.
                target_w = self._layout_width(layout)
                try:
                    was_zoomed = self.state() == "zoomed"
                except Exception:
                    was_zoomed = False
                try:
                    if was_zoomed:
                        self.state("normal")
                        self.update_idletasks()
                except Exception:
                    pass
                _new_geo = self._dock_geometry(target_w)
                self.geometry(_new_geo)
                self._last_geometry = _new_geo
                # A plain geometry() call isn't always fully honored by
                # Windows on the FIRST attempt when growing the window a
                # lot in one step (narrow "compact" -> wide "full") — the
                # symptom is panel 1 rendering squeezed into the old,
                # narrower width until something forces a real repaint
                # (manually maximizing was the giveaway: that's a
                # window-manager-level resize, which always "took",
                # unlike our programmatic one). update() forces Tk to
                # actually finish the resize/repaint synchronously right
                # here instead of leaving it pending, and the two delayed
                # re-asserts below catch anything a monitor/DPI recalc or
                # leftover Windows animation still overwrites afterward.
                try:
                    self.update()
                except Exception:
                    pass
                # ── Cancel the PREVIOUS transition's re-asserts ────────
                # These two timers exist to beat Windows' own delayed
                # resize. They were never cancelled, so two layout
                # changes inside 220ms left the earlier one's timers
                # still armed — and they fire LAST, slamming the window
                # back to the width the user just moved away from.
                #
                # That is the "collapse the panels and the window stays
                # full-screen wide with an empty white half" bug: from
                # full -> partial -> compact, compact set 585px and then
                # full's 220ms timer put 1920px back. The panels really
                # were hidden (grid_remove worked); only the WINDOW was
                # one layout behind, which is why it looked like a
                # half-drawn app rather than a wrong size.
                for _h in getattr(self, "_redock_ids", ()):
                    try:
                        self.after_cancel(_h)
                    except Exception:
                        pass
                self._redock_ids = (
                    self.after(60, lambda g=_new_geo: self._redock(g)),
                    self.after(220, lambda g=_new_geo: self._redock(g)))
        except Exception as e:
            log.debug("panel layout: %s", e)

    # ── Keyboard Shortcuts panel — press ? or F1 ─────────────────────────────
    def _show_shortcuts_panel(self):
        """Theme-aware overlay listing every keyboard shortcut."""
        old = getattr(self, "_sc_win", None)
        if old is not None:
            try:
                if old.winfo_exists():
                    old.destroy()
                    return
            except Exception:
                pass
        pc = _PANEL_COLORS[self._mode]
        acc = self.T("GREEN")
        win = tk.Toplevel(self)
        self._sc_win = win
        win.wm_overrideredirect(True)
        win.configure(bg=pc["border"])
        inner = tk.Frame(win, bg=pc["card2"], padx=SP5, pady=SP4)
        inner.pack(padx=1, pady=1)

        tk.Label(inner, text="⌨  KEYBOARD SHORTCUTS", bg=pc["card2"],
                 fg=acc, font=F_H2).pack(anchor="w", pady=(0, SP3))

        SHORTCUTS = [
            ("Ctrl + Z", "Undo the last task change"),
            ("Ctrl + S", "Save everything now"),
            ("Ctrl + T", "Cycle theme — FOCUS · WAR ROOM · ENERGY · EXECUTIVE"),
            ("Ctrl + F", "Focus Mode — clock + task list only"),
            ("Ctrl + W / Esc", "Close the active dialog"),
            ("Right-click", "Cut / Copy / Paste in any text field"),
            ("?  /  F1", "Show or hide this panel"),
        ]
        for key, desc in SHORTCUTS:
            row = tk.Frame(inner, bg=pc["card2"])
            row.pack(fill="x", pady=2)
            tk.Label(row, text=" " + key + " ", bg=pc["ctrl_bg"], fg=acc,
                     font=(_FM, 9, "bold"), padx=SP2, pady=2,
                     width=14).pack(side="left")
            tk.Label(row, text=desc, bg=pc["card2"], fg=pc["menu_fg"],
                     font=F_SMALL, anchor="w").pack(side="left", padx=(SP3, 0))

        tk.Label(inner, text="Press Esc to close", bg=pc["card2"],
                 fg=pc["muted"], font=F_XS).pack(anchor="e", pady=(SP3, 0))

        win.update_idletasks()
        x = self.winfo_rootx() + (self.winfo_width() - win.winfo_width()) // 2
        y = self.winfo_rooty() + (self.winfo_height() - win.winfo_height()) // 2
        win.geometry(f"+{max(x, 0)}+{max(y, 0)}")
        win.bind("<Escape>", lambda e: win.destroy())
        win.bind("<FocusOut>", lambda e: self.after(
            100, lambda: win.winfo_exists() and win.destroy()))
        win.focus_set()

    # ── First-run onboarding — 3-step welcome ────────────────────────────────
    def _show_onboarding(self):
        """One-time 3-step welcome tour. Sets self._onboarded when done."""
        pc = _PANEL_COLORS[self._mode]
        acc = self.T("GREEN")
        win = tk.Toplevel(self)
        win.title("Welcome")
        win.configure(bg=pc["card2"])
        win.transient(self)
        win.resizable(False, False)
        try:
            win.grab_set()
        except Exception:
            pass

        STEPS = [
            ("◎", "Welcome to Task Tracker",
             "You're looking at just your clock and tasks — on purpose.\n"
             "One task visible at a time, one MIT, no overwhelming list.\n"
             "If a full list of tabs and panels usually makes you shut\n"
             "down before you start, that's exactly the problem this\n"
             "layout is built to avoid.\n\n"
             "Two more panels are one click away:\n\n"
             "•  ◀ on this panel — reveal your GOALS\n"
             "•  ◀ on that panel — reveal your 6 PROJECTS\n\n"
             "Keep it narrow and pin it to one side of your screen,\n"
             "or expand to the full 3-panel workspace any time."),
            ("⏱", "Track your deep work",
             "Press START WORK or any task's play button —\n"
             "the progress bar fills as real work happens.\n\n"
             "The bar maps your day from 9am to midnight,\n"
             "and resets fresh every morning.\n\n"
             "Try Ctrl+T to cycle the 4 premium themes."),
            ("⌨", "Work like a pro",
             "•  Tools menu — Life OS, Finance, Business Plan, Deep Work\n"
             "•  Ctrl+F — Focus Mode: just the clock and your tasks\n"
             "•  ?  — see every keyboard shortcut\n"
             "•  Everything auto-saves. Just close when done.\n\n"
             "That's it — go do the work."),
        ]
        state = {"i": 0}
        icon_l = tk.Label(win, bg=pc["card2"], fg=acc, font=(_F, 34))
        title_l = tk.Label(win, bg=pc["card2"], fg=pc["menu_fg"], font=F_H1)
        body_l = tk.Label(win, bg=pc["card2"], fg=pc["sec_text"],
                          font=F_BODY, justify="left", anchor="w")
        icon_l.pack(pady=(SP6, SP1))
        title_l.pack(pady=(0, SP3))
        body_l.pack(padx=SP6, fill="x")

        dots = tk.Frame(win, bg=pc["card2"])
        dots.pack(pady=SP4)
        dot_lbls = [tk.Label(dots, text="●", bg=pc["card2"], font=F_SMALL)
                    for _ in STEPS]
        for dl in dot_lbls:
            dl.pack(side="left", padx=3)

        btns = tk.Frame(win, bg=pc["card2"])
        btns.pack(pady=(0, SP5))
        back_b = tk.Button(btns, text="←  Back", font=F_SMALL_B, relief="flat",
                           bg=pc["ctrl_bg"], fg=pc["sec_text"], padx=SP4,
                           pady=SP1, cursor="hand2", bd=0)
        next_b = tk.Button(btns, text="Next  →", font=F_SMALL_B, relief="flat",
                           # was: white everywhere except a warroom special
                           # case. _ink derives the same answer from the
                           # accent's luminance, so JOURNEY's mint stops
                           # being the exception nobody wrote a branch for.
                           bg=acc, fg=_ink(acc), padx=SP5, pady=SP1,
                           cursor="hand2", bd=0)
        back_b.pack(side="left", padx=SP2)
        next_b.pack(side="left", padx=SP2)

        def render():
            i = state["i"]
            ic, ti, bo = STEPS[i]
            icon_l.config(text=ic)
            title_l.config(text=ti)
            body_l.config(text=bo)
            for j, dl in enumerate(dot_lbls):
                dl.config(fg=acc if j == i else pc["muted"])
            back_b.config(state="normal" if i > 0 else "disabled")
            next_b.config(text="Get Started  ✓" if i == len(STEPS) - 1 else "Next  →")

        def go(delta):
            i = state["i"] + delta
            if i >= len(STEPS):
                finish()
                return
            state["i"] = max(0, i)
            render()

        def finish():
            self._onboarded = True
            save_data(self)
            try:
                win.destroy()
            except Exception:
                pass

        back_b.config(command=lambda: go(-1))
        next_b.config(command=lambda: go(+1))
        win.protocol("WM_DELETE_WINDOW", finish)
        win.bind("<Escape>", lambda e: finish())
        render()
        win.update_idletasks()
        x = self.winfo_rootx() + (self.winfo_width() - win.winfo_width()) // 2
        y = self.winfo_rooty() + (self.winfo_height() - win.winfo_height()) // 2
        win.geometry(f"+{max(x, 20)}+{max(y, 20)}")

    def _show_tools_menu(self, anchor=None):
        """Popup tools menu — opens to the LEFT of whichever button opened
        it (right edge of menu lines up with right edge of the button),
        not below-right. The gear (its normal home now) sits at panel 3's
        top-right corner, flush against the screen edge — a menu that
        opened rightward from there would run straight off-screen."""
        try:
            btn = anchor or self._tools_btn_ref
            btn.update_idletasks()
            btn_right = btn.winfo_rootx() + btn.winfo_width()
            y = btn.winfo_rooty() + btn.winfo_height() + 2
        except Exception:
            btn_right, y = 500, 300

        menu = tk.Toplevel(self)
        menu.wm_overrideredirect(True)
        menu.configure(bg=_PANEL_COLORS[self._mode]["menu_bg"])

        M_BG = _PANEL_COLORS[self._mode]["menu_bg"]
        M_BDR = _PANEL_COLORS[self._mode]["border"]
        M_FG = _PANEL_COLORS[self._mode]["menu_fg"]
        M_HVR = _PANEL_COLORS[self._mode]["menu_hover"]

        outer = tk.Frame(menu, bg=M_BDR, padx=1, pady=1)
        outer.pack()
        inner = tk.Frame(outer, bg=M_BG)
        inner.pack()

        M_MUT = _PANEL_COLORS[self._mode]["muted"]
        TOOLS = [
            ("◈", "Life Execution Board", "Habits, scores and life systems",
             self._open_life_os),
            ("◉", "Cash Is Your Brain", "Wallets, budgets and cashflow",
             self._open_finance_tracker),
            ("▤", "Business Dev Plan", "6-block strategy canvas",
             self._open_self_dev_window),
            ("❖", "Goal Step", "Goal → Task → next single step",
             self._open_goal_roadmap),
            ("◐", "Deep Work", "Flow, load and sleep scored per session",
             self._open_deep_work),
            ("♪", "Browse Music", "Choose a music file or folder",
             self._browse_music),
            ("◎", "Focus Mode", "Clock + tasks only  ·  Ctrl+F",
             self._toggle_focus_mode),
            ("◑", "Re-entry", "Morning/night operating system for your day",
             self._open_reentry_page),
            ("⚙", "Settings", "Language, work hours, export, about",
             self._show_settings),
        ]

        for icon, label, desc, cmd in TOOLS:
            row = tk.Frame(inner, bg=M_BG, cursor="hand2")
            row.pack(fill="x")
            ic = tk.Label(row, text=icon, bg=M_BG, fg=M_FG,
                          font=(_F, 13), padx=SP3, pady=SP2)
            ic.pack(side="left")
            txt = tk.Frame(row, bg=M_BG)
            txt.pack(side="left", fill="x", expand=True, pady=SP1)
            l1 = tk.Label(txt, text=label, bg=M_BG, fg=M_FG,
                          font=F_BODY_B, anchor="w")
            l1.pack(fill="x", padx=(0, SP5))
            l2 = tk.Label(txt, text=desc, bg=M_BG, fg=M_MUT,
                          font=F_XS, anchor="w")
            l2.pack(fill="x", padx=(0, SP5))
            widgets = (row, ic, txt, l1, l2)

            def _on_enter(e, ws=widgets, bg=M_HVR):
                for w in ws:
                    w.config(bg=bg)

            def _on_leave(e, ws=widgets, bg=M_BG):
                for w in ws:
                    w.config(bg=bg)

            def _click(e, fn=cmd, m=menu):
                m.destroy()
                fn()
            for w in widgets:
                w.bind("<Enter>", _on_enter)
                w.bind("<Leave>", _on_leave)
                w.bind("<Button-1>", _click)
            tk.Frame(inner, bg=M_BDR, height=1).pack(fill="x")

        # Position now that the menu has its real width — right edge
        # lines up with the button's right edge, so it opens leftward.
        menu.update_idletasks()
        mw = menu.winfo_reqwidth()
        x = max(btn_right - mw, 0)
        menu.geometry(f"+{x}+{y}")
        menu.lift()

        # Close on click outside or Escape
        menu.bind("<FocusOut>", lambda e: self.after(100, lambda: (
            menu.winfo_exists() and menu.destroy())))
        menu.bind("<Escape>", lambda e: menu.destroy())
        menu.focus_set()

    def _show_empty_tools_menu(self):
        """"+ Tools" pill's dropdown, now intentionally empty — every item
        that used to live here moved to the ⚙ gear (_show_tools_menu).
        Still a real dropdown (not a no-op) so the button doesn't feel
        broken; just nothing under it yet. Opens to the LEFT of the
        button (right edges aligned), matching _show_tools_menu."""
        try:
            btn = self._tools_btn_ref
            btn.update_idletasks()
            btn_right = btn.winfo_rootx() + btn.winfo_width()
            y = btn.winfo_rooty() + btn.winfo_height() + 2
        except Exception:
            btn_right, y = 500, 300

        menu = tk.Toplevel(self)
        menu.wm_overrideredirect(True)
        menu.configure(bg=_PANEL_COLORS[self._mode]["menu_bg"])

        M_BG = _PANEL_COLORS[self._mode]["menu_bg"]
        M_BDR = _PANEL_COLORS[self._mode]["border"]
        M_MUT = _PANEL_COLORS[self._mode]["muted"]

        outer = tk.Frame(menu, bg=M_BDR, padx=1, pady=1)
        outer.pack()
        inner = tk.Frame(outer, bg=M_BG)
        inner.pack()
        tk.Label(inner, text="Nothing here yet", bg=M_BG, fg=M_MUT,
                 font=F_XS, padx=SP4, pady=SP3).pack()

        menu.update_idletasks()
        mw = menu.winfo_reqwidth()
        x = max(btn_right - mw, 0)
        menu.geometry(f"+{x}+{y}")
        menu.lift()

        menu.bind("<FocusOut>", lambda e: self.after(100, lambda: (
            menu.winfo_exists() and menu.destroy())))
        menu.bind("<Escape>", lambda e: menu.destroy())
        menu.focus_set()

    # ── Finance Tracker launcher ──────────────────────────────────────────────
    def _open_finance_tracker(self):
        """Launch the finance app (cash_is_your_brain.py) in its own process.

        Tries the current filename first, then the older
        `finance_tracker.py` — which is what this used to look for, and
        which never actually shipped, so this menu entry was a dead link
        that only ever produced a "not found" dialog. Stdlib-only and it
        keeps its own finance_data.json beside the script, so it cannot
        touch this app's store."""
        import subprocess
        import sys
        import os
        from tkinter import messagebox
        try:
            base_dir = os.path.dirname(os.path.abspath(__file__))
        except NameError:
            base_dir = os.path.dirname(os.path.abspath(sys.argv[0]))

        path = None
        for _name in ("cash_is_your_brain.py", "finance_tracker.py"):
            _cand = os.path.join(base_dir, _name)
            if os.path.exists(_cand):
                path = _cand
                break
        if path is None:
            messagebox.showerror(
                "Finance Tracker not found",
                "Could not find 'cash_is_your_brain.py'.\n\n"
                "Please make sure it is in the same folder as this Task "
                f"Tracker, then try again.\n\nLooked in:\n{base_dir}")
            log.warning("cash_is_your_brain.py not found in %s", base_dir)
            return
        try:
            py = sys.executable
            if os.name == "nt":
                pyw = py.replace("python.exe", "pythonw.exe")
                if os.path.exists(pyw):
                    py = pyw
            subprocess.Popen([py, path], cwd=base_dir)
            log.info("Launched finance app from %s", path)
        except Exception as e:
            log.error("Failed to launch finance app: %s", e)
            messagebox.showerror("Could not open Finance Tracker", str(e))

    # ── Life OS launcher ──────────────────────────────────────────────────────
    def _open_life_os(self):
        """Launch the standalone Life OS app (life_os.py) as a separate process.

        Looks for life_os.py in the same folder as this task tracker. Also
        accepts the older life_os_35.py filename this used to look for, in
        case an existing install still has it under that name. Runs it
        with the same Python interpreter, in its own window, so the two
        apps stay fully independent (separate data, separate event loops).
        """
        import subprocess
        import sys
        import os
        from tkinter import messagebox

        # Launching Life OS means spawning a whole second Python + Tk
        # process, which genuinely takes a few seconds to boot its own
        # interpreter and build its window — that isn't something this
        # click can skip. Without any feedback the click just looks
        # ignored/frozen for that whole stretch, so flip the cursor to
        # "wait" immediately and restore it once the window has almost
        # certainly appeared, purely so the click feels acknowledged.
        try:
            self.config(cursor="watch")
            self.update_idletasks()
            self.after(2500, lambda: self.config(cursor=""))
        except Exception:
            pass

        try:
            base_dir = os.path.dirname(os.path.abspath(__file__))
        except NameError:
            base_dir = os.path.dirname(os.path.abspath(sys.argv[0]))

        life_os_path = os.path.join(base_dir, "life_os.py")
        if not os.path.exists(life_os_path):
            _legacy = os.path.join(base_dir, "life_os_35.py")
            if os.path.exists(_legacy):
                life_os_path = _legacy

        if not os.path.exists(life_os_path):
            messagebox.showerror(
                "Life OS not found",
                "Could not find 'life_os.py'.\n\n"
                "Please make sure life_os.py is in the same folder as "
                "this Task Tracker, then try again.\n\n"
                f"Looked in:\n{base_dir}")
            log.warning("life_os.py not found in %s", base_dir)
            return

        try:
            # pythonw on Windows = no console window; fall back to python
            py = sys.executable
            if os.name == "nt":
                pyw = py.replace("python.exe", "pythonw.exe")
                if os.path.exists(pyw):
                    py = pyw
            subprocess.Popen([py, life_os_path], cwd=base_dir)
            log.info("Launched Life OS from %s", life_os_path)
        except Exception as e:
            log.error("Failed to launch Life OS: %s", e)
            messagebox.showerror(
                "Could not open Life OS",
                f"An error occurred while launching Life OS:\n\n{e}")

    # ── Goal Roadmap launcher ───────────────────────────────────────────────────
    def _open_goal_roadmap(self):
        """Launch the standalone Goal Roadmap app (goal_roadmap.py) as a
        separate process — same pattern as Life OS / Finance Tracker: its
        own interpreter, its own window, its own data file, so a crash or
        a missing dependency there can never take this app down with it.

        goal_roadmap.py depends on the third-party `customtkinter` package
        (that script shows its own "pip install customtkinter" dialog if
        it's missing) — this is fine precisely because it runs in its own
        process; the zero-dependency rule is about THIS file, not every
        tool it can open."""
        import subprocess
        import sys
        import os
        from tkinter import messagebox

        try:
            base_dir = os.path.dirname(os.path.abspath(__file__))
        except NameError:
            base_dir = os.path.dirname(os.path.abspath(sys.argv[0]))

        roadmap_path = os.path.join(base_dir, "goal_roadmap.py")

        if not os.path.exists(roadmap_path):
            messagebox.showerror(
                "Goal Step not found",
                "Could not find 'goal_roadmap.py'.\n\n"
                "Please make sure goal_roadmap.py is in the same folder as "
                "this Task Tracker, then try again.\n\n"
                f"Looked in:\n{base_dir}")
            log.warning("goal_roadmap.py not found in %s", base_dir)
            return

        try:
            py = sys.executable
            if os.name == "nt":
                pyw = py.replace("python.exe", "pythonw.exe")
                if os.path.exists(pyw):
                    py = pyw
            subprocess.Popen([py, roadmap_path], cwd=base_dir)
            log.info("Launched Goal Roadmap from %s", roadmap_path)
        except Exception as e:
            log.error("Failed to launch Goal Roadmap: %s", e)
            messagebox.showerror(
                "Could not open Goal Step",
                f"An error occurred while launching Goal Step:\n\n{e}")

    # ── Re-entry page launcher ──────────────────────────────────────────────────
    def _open_reentry_page(self):
        """Launch the standalone Re-entry app (reentry_app.py) as a separate
        process — same pattern as Goal Step / Life OS: its own interpreter,
        its own window, its own data file (reentry_data.db), so it can never
        take the main tracker down."""
        import subprocess
        import sys
        import os
        from tkinter import messagebox

        try:
            base_dir = os.path.dirname(os.path.abspath(__file__))
        except NameError:
            base_dir = os.path.dirname(os.path.abspath(sys.argv[0]))

        reentry_path = os.path.join(base_dir, "reentry_app.py")

        if not os.path.exists(reentry_path):
            messagebox.showerror(
                "Re-entry not found",
                "Could not find 'reentry_app.py'.\n\n"
                "Please make sure reentry_app.py (and the 'reentry' folder "
                "next to it) are in the same folder as this Task Tracker, "
                "then try again.\n\n"
                f"Looked in:\n{base_dir}")
            log.warning("reentry_app.py not found in %s", base_dir)
            return

        try:
            py = sys.executable
            if os.name == "nt":
                pyw = py.replace("python.exe", "pythonw.exe")
                if os.path.exists(pyw):
                    py = pyw
            subprocess.Popen([py, reentry_path], cwd=base_dir)
            log.info("Launched Re-entry from %s", reentry_path)
        except Exception as e:
            log.error("Failed to launch Re-entry: %s", e)
            messagebox.showerror(
                "Could not open Re-entry",
                f"An error occurred while launching Re-entry:\n\n{e}")

    # ── Deep Work OS launcher ───────────────────────────────────────────────────
    def _open_deep_work(self, task=""):
        """Launch the standalone Deep Work OS app (deep_work_os.py) in its
        own process — same pattern as Life OS / Goal Step / Finance.

        `task` is passed through as --task, which makes Deep Work open
        straight into a new session with that text as the session's
        outcome. Called with no argument from the ⚙ menu (just open the
        app) and with a task from the 🧠 button on a project task row.

        It is stdlib-only (tkinter, no third-party packages) and keeps its
        own store in ~/.deep_work_os/, so it can't touch this app's data
        file even by accident."""
        import subprocess
        import sys
        import os
        from tkinter import messagebox

        try:
            base_dir = os.path.dirname(os.path.abspath(__file__))
        except NameError:
            base_dir = os.path.dirname(os.path.abspath(sys.argv[0]))

        dw_path = os.path.join(base_dir, "deep_work_os.py")

        if not os.path.exists(dw_path):
            messagebox.showerror(
                "Deep Work not found",
                "Could not find 'deep_work_os.py'.\n\n"
                "Please make sure deep_work_os.py is in the same folder as "
                "this Task Tracker, then try again.\n\n"
                f"Looked in:\n{base_dir}")
            log.warning("deep_work_os.py not found in %s", base_dir)
            return

        try:
            py = sys.executable
            if os.name == "nt":
                pyw = py.replace("python.exe", "pythonw.exe")
                if os.path.exists(pyw):
                    py = pyw
            _cmd = [py, dw_path]
            if task and str(task).strip():
                _cmd += ["--task", str(task).strip()[:120]]
            # Deep Work OS has its own copy of this app's L()/LANG
            # pattern for its main shell text (top bar, sidebar, hero) —
            # pass through whatever language this app is currently
            # showing so the two don't disagree the moment Deep Work
            # opens. Only "bn" is meaningful to it; anything else is
            # treated as English on its side, so passing the raw
            # setting value straight through is safe even if it's
            # missing or some other value.
            _cmd += ["--lang",
                    "bn" if self._settings.get("lang") == "bn" else "en"]
            subprocess.Popen(_cmd, cwd=base_dir)
            log.info("Launched Deep Work OS from %s (task=%r)", dw_path, task)
        except Exception as e:
            log.error("Failed to launch Deep Work OS: %s", e)
            messagebox.showerror(
                "Could not open Deep Work",
                f"An error occurred while launching Deep Work:\n\n{e}")

    def _open_habit_tracker(self):
        """Open the full-screen habit tracker window."""
        win_attr = "_habit_win"
        existing = getattr(self, win_attr, None)
        if existing:
            try:
                if existing.winfo_exists():
                    self._bring_window_front(existing)
                    return
            except Exception:
                pass

        import datetime as _dt
        try:
            import matplotlib
            matplotlib.use("TkAgg")
            from matplotlib.figure import Figure
            from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
            HAS_MPL = True
        except Exception as _e:
            log.debug("matplotlib unavailable: %s", _e)
            HAS_MPL = False

        _VB = {
            "focus": {
                "bg": "#F5F3EF", "card": "#FDFCFA", "card2": "#EFF0EC", "border": "#D9D4CE",
                "pri": "#1A1714", "sec": "#6B6560", "muted": "#A8A39D",
                "money": "#185FA5", "health": "#2D6A4F", "relation": "#8B5E1A",
                "mind": "#5B21B6", "success": "#2D6A4F", "warning": "#92400E",
                "danger": "#9B2335", "input": "#F0EDE8",
            },
            "warroom": {
                "bg": "#0A0E17", "card": "#111827", "card2": "#0D1521", "border": "#1E2A3A",
                "pri": "#E8EDF5", "sec": "#7A8899", "muted": "#475569",
                "money": "#58A6FF", "health": "#00D4AA", "relation": "#FFB800",
                "mind": "#A855F7", "success": "#00D4AA", "warning": "#FFB800",
                "danger": "#FF4D6D", "input": "#0D1521",
            },
            "energy": {
                "bg": "#FFF8F0", "card": "#FFFFFF", "card2": "#FFF4EC", "border": "#FFD9B3",
                "pri": "#1A0A00", "sec": "#7A4020", "muted": "#C4956A",
                "money": "#185FA5", "health": "#059669", "relation": "#A15904",
                "mind": "#7C3AED", "success": "#059669", "warning": "#A15904",
                "danger": "#D02222", "input": "#FFF4EC",
            },
            "corporate": {
                "bg": "#FAF8F5", "card": "#FFFFFF", "card2": "#F5F1EC", "border": "#E7E2DB",
                "pri": "#1C1917", "sec": "#78716C", "muted": "#726B66",
                "money": "#0C4A6E", "health": "#059669", "relation": "#AE5009",
                "mind": "#7C3AED", "success": "#059669", "warning": "#A15904",
                "danger": "#D02222", "input": "#F5F1EC",
            },
            "journey": {
                "bg": "#0D1110", "card": "#161B19", "card2": "#121715", "border": "#2A3731",
                "pri": "#FFFFFF", "sec": "#9FC2AE", "muted": "#6C8A7E",
                "money": "#4CE0A0", "health": "#38B384", "relation": "#F5C451",
                "mind": "#7C9EF5", "success": "#4CE0A0", "warning": "#F5C451",
                "danger": "#F0776B", "input": "#121715",
            },
            "rize": {
                "bg": "#FFFFFF", "card": "#FFFFFF", "card2": "#F9FAFB", "border": "#E5E7EB",
                "pri": "#111827", "sec": "#6B7280", "muted": "#6C7586",
                "money": "#0C4A6E", "health": "#059669", "relation": "#AE5009",
                "mind": "#5255EF", "success": "#059669", "warning": "#A15904",
                "danger": "#D02222", "input": "#F9FAFB",
            },
        }
        T = _VB[self._mode]
        def gc(k): return T[k]

        today = str(_dt.date.today())
        if today not in self._habit_data:
            self._habit_data[today] = {}

        def get_habits(cat):
            return self._habits_for(cat)

        def set_habits(cat, lst):
            self._habit_data[f"__habits_{cat}"] = lst
            save_data(self)

        CATS = _HABIT_CATS

        def calc_score():
            td = self._habit_data.get(today, {})
            total = sum(len(get_habits(c)) for _, c in CATS)
            done = sum(1 for cd in td.values()
                       if isinstance(cd, dict) for v in cd.values() if v)
            return int(done / max(total, 1) * 100)

        def calc_cat_pct(cat):
            h = get_habits(cat)
            td = self._habit_data.get(today, {}).get(cat, {})
            done = sum(1 for x in h if isinstance(td, dict) and td.get(x, False))
            return int(done / max(len(h), 1) * 100)

        def calc_streak():
            streak = 0
            d = _dt.date.today()
            while True:
                ds = str(d)
                if ds not in self._habit_data:
                    break
                td = self._habit_data[ds]
                total = sum(len(get_habits(c)) for _, c in CATS)
                done = sum(1 for cd in td.values()
                           if isinstance(cd, dict) for v in cd.values() if v)
                if done / max(total, 1) < 0.5:
                    break
                streak += 1
                d -= _dt.timedelta(days=1)
            return streak

        def week_scores():
            out = []
            for i in range(6, -1, -1):
                d = _dt.date.today() - _dt.timedelta(days=i)
                dd = self._habit_data.get(str(d), {})
                total = sum(len(get_habits(c)) for _, c in CATS)
                done = sum(1 for cd in dd.values()
                           if isinstance(cd, dict) for v in cd.values() if v)
                out.append((d.strftime("%a"), int(done / max(total, 1) * 100)))
            return out

        # ── Window ────────────────────────────────────────────────────────────
        win = tk.Toplevel(self)
        setattr(self, win_attr, win)
        win.title("Life Execution Dashboard")
        win.configure(bg=gc("bg"))
        self._setup_window(win, "_habit_win_geo", "1200x860+20+20")

        # ── night flag — used by _card and throughout this window ────────────
        night = self._mode in ("warroom", "journey")

        cat_pb_refs = {}
        cat_score_lbls = {}

        # ── Helpers ───────────────────────────────────────────────────────────
        _shadow_colors = {
            "focus": "#C8D4CC", "warroom": "#0A1A30",
            "energy": "#F0C8A8", "corporate": "#1E1B4B",
            "journey": "#070908", "rize": "#DDE1E6",
        }

        def _card(parent, row=0, col=0, rowspan=1, colspan=1,
                  accent=None, padx=(0, 0), pady=(0, SP2)):
            sh_col = _shadow_colors[self._mode]
            if not night:
                sh = tk.Frame(parent, bg=sh_col)
                sh.grid(row=row, column=col, rowspan=rowspan,
                        columnspan=colspan, sticky="nsew",
                        padx=padx, pady=pady)
                sh.columnconfigure(0, weight=1)
                sh.rowconfigure(0, weight=1)
                c = tk.Frame(sh, bg=gc("card"), highlightthickness=0)
                c.grid(row=0, column=0, sticky="nsew", padx=(0, 1), pady=(0, 2))
            else:
                c = tk.Frame(parent, bg=gc("card"),
                             highlightthickness=1,
                             highlightbackground=gc("border"))
                c.grid(row=row, column=col, rowspan=rowspan,
                       columnspan=colspan, sticky="nsew",
                       padx=padx, pady=pady)
            if accent:
                tk.Frame(c, bg=accent, height=3).pack(fill="x")
            return c

        def _section(card, title, color):
            h = tk.Frame(card, bg=gc("card2"))
            h.pack(fill="x")
            tk.Frame(h, bg=color, width=4).pack(side="left", fill="y")
            tk.Label(h, text=title, bg=gc("card2"), fg=color,
                     font=F_BODY_B, padx=SP3, pady=7).pack(side="left")
            tk.Frame(card, bg=gc("border"), height=1).pack(fill="x")
            return h

        # ══════════════════════════════════════════════════════════════════════
        # TOP BAR — score ring + intention + streak
        # ══════════════════════════════════════════════════════════════════════
        top = tk.Frame(win, bg=gc("card"))
        top.pack(fill="x")
        tk.Frame(top, bg=gc("money"), height=4).pack(fill="x")

        top_inner = tk.Frame(top, bg=gc("card"))
        top_inner.pack(fill="x", padx=SP4, pady=SP2)
        top_inner.columnconfigure(1, weight=1)

        # Score circle (canvas drawn)
        score_cv = tk.Canvas(top_inner, width=80, height=80,
                             bg=gc("card"), highlightthickness=0)
        score_cv.grid(row=0, column=0, rowspan=2, padx=(0, 16))
        score_val_lbl = tk.Label(top_inner, text="0",
                                 bg=gc("card"), fg=gc("warning"),
                                 font=(_F, 24, "bold"))
        score_val_lbl.grid(row=0, column=0, rowspan=2)  # overlaid via place later

        def _draw_score_ring(sc):
            score_cv.delete("all")
            # Background ring
            score_cv.create_oval(8, 8, 72, 72, outline=gc("border"), width=6)
            if sc > 0:
                import math
                col = (gc("success") if sc >= 70 else
                       gc("warning") if sc >= 40 else gc("danger"))
                angle = -sc / 100 * 360
                # Draw arc (approximated with lines)
                cx, cy, r = 40, 40, 32
                steps = max(1, abs(int(angle)))
                for step in range(steps):
                    a1 = math.radians(90 - step)
                    a2 = math.radians(90 - step - 1)
                    score_cv.create_line(
                        cx + r * math.cos(a1), cy - r * math.sin(a1),
                        cx + r * math.cos(a2), cy - r * math.sin(a2),
                        fill=col, width=6, capstyle="round")
            score_cv.create_text(40, 36, text=str(sc),
                                 fill=gc("pri"), font=F_H1)
            score_cv.create_text(40, 54, text="/100",
                                 fill=gc("muted"), font=F_XS)

        # Intention box
        intent_frame = tk.Frame(top_inner, bg=gc("card"))
        intent_frame.grid(row=0, column=1, sticky="ew", pady=(0, 4))
        intent_frame.columnconfigure(1, weight=1)
        tk.Label(intent_frame, text="◎  TODAY I WILL:",
                 bg=gc("card"), fg=gc("money"),
                 font=F_XS).grid(row=0, column=0, sticky="w")
        _intent_key = f"__intention_{today}"
        intent_var = tk.StringVar(value=self._habit_data.get(_intent_key, ""))
        intent_e = tk.Entry(intent_frame, textvariable=intent_var,
                            bg=gc("input"), fg=gc("pri"),
                            insertbackground=gc("pri"),
                            relief="flat", font=F_H3,
                            highlightthickness=1,
                            highlightbackground=gc("border"),
                            highlightcolor=gc("money"), bd=0)
        intent_e.grid(row=0, column=1, sticky="ew", padx=(8, 0), ipady=4)

        def _save_intent(e=None):
            self._habit_data[_intent_key] = intent_var.get()
            save_data(self)
        intent_e.bind("<FocusOut>", _save_intent)
        intent_e.bind("<Return>", _save_intent)

        # Win box
        win_frame = tk.Frame(top_inner, bg=gc("card"))
        win_frame.grid(row=1, column=1, sticky="ew")
        win_frame.columnconfigure(1, weight=1)
        tk.Label(win_frame, text="◈  TODAY'S WIN:",
                 bg=gc("card"), fg=gc("success"),
                 font=F_XS).grid(row=0, column=0, sticky="w")
        _win_key = f"__win_{today}"
        win_var = tk.StringVar(value=self._habit_data.get(_win_key, ""))
        win_e = tk.Entry(win_frame, textvariable=win_var,
                         bg=gc("input"), fg=gc("pri"),
                         insertbackground=gc("pri"),
                         relief="flat", font=F_BODY,
                         highlightthickness=1,
                         highlightbackground=gc("border"),
                         highlightcolor=gc("success"), bd=0)
        win_e.grid(row=0, column=1, sticky="ew", padx=(8, 0), ipady=4)

        def _save_win(e=None):
            self._habit_data[_win_key] = win_var.get()
            save_data(self)
        win_e.bind("<FocusOut>", _save_win)
        win_e.bind("<Return>", _save_win)

        # Streak + alert
        right_top = tk.Frame(top_inner, bg=gc("card"))
        right_top.grid(row=0, column=2, rowspan=2, sticky="e", padx=(16, 0))
        streak_lbl = tk.Label(right_top, text="🔥 0 days",
                              bg=gc("card"), fg=gc("warning"),
                              font=F_H1)
        streak_lbl.pack(anchor="e")
        tk.Label(right_top, text="STREAK", bg=gc("card"), fg=gc("muted"),
                 font=F_XS).pack(anchor="e")
        alert_lbl = tk.Label(right_top, text="",
                             bg=gc("card"), fg=gc("danger"),
                             font=F_XS)
        alert_lbl.pack(anchor="e", pady=(4, 0))

        tk.Frame(win, bg=gc("border"), height=1).pack(fill="x")

        # ══════════════════════════════════════════════════════════════════════
        # MAIN AREA — 3 columns: habits | weekly graph | reflection+report
        # ══════════════════════════════════════════════════════════════════════
        main = tk.Frame(win, bg=gc("bg"))
        main.pack(fill="both", expand=True, padx=SP3, pady=SP2)
        main.columnconfigure(0, weight=2)
        main.columnconfigure(1, weight=2)
        main.columnconfigure(2, weight=1)
        main.rowconfigure(0, weight=1)
        main.rowconfigure(1, weight=1)

        # ── COL 0+1 LEFT: 4 habit cards in 2x2 grid ──────────────────────────
        habits_area = tk.Frame(main, bg=gc("bg"))
        habits_area.grid(row=0, column=0, columnspan=2, rowspan=2,
                         sticky="nsew", padx=(0, 8))
        habits_area.columnconfigure(0, weight=1)
        habits_area.columnconfigure(1, weight=1)
        habits_area.rowconfigure(0, weight=1)
        habits_area.rowconfigure(1, weight=1)

        PARENTS = [(0, 0), (0, 1), (1, 0), (1, 1)]

        def _build_cat(row, col, cat_label, cat_key):
            acc = gc(cat_key)
            card = _card(habits_area, row=row, col=col,
                         padx=(0, 6) if col == 0 else (6, 0),
                         pady=(0, 6) if row == 0 else (6, 0))
            card.columnconfigure(0, weight=1)
            card.rowconfigure(2, weight=1)

            _section(card, cat_label, acc)

            # Habit list
            hf = tk.Frame(card, bg=gc("card"))
            hf.pack(fill="both", expand=True, padx=SP2, pady=(6, 4))
            hf.columnconfigure(1, weight=1)

            check_vars = []

            def _rebuild(hf2=hf, ck=cat_key, cv_ref=check_vars):
                for w in hf2.winfo_children():
                    w.destroy()
                cv_ref.clear()
                habits = get_habits(ck)
                if not habits:
                    tk.Label(hf2, text="No habits yet — add one below to start a streak",
                             bg=gc("card"), fg=gc("muted"), font=F_XS,
                             anchor="w", justify="left", wraplength=230
                             ).grid(row=0, column=0, columnspan=4,
                                    sticky="ew", pady=(6, 6))
                for i, habit in enumerate(habits):
                    saved = (self._habit_data.get(today, {})
                             .get(ck, {})
                             if isinstance(self._habit_data.get(today, {}).get(ck, {}), dict)
                             else {}).get(habit, False)
                    var = tk.BooleanVar(value=saved)
                    cv_ref.append(var)
                    h_bg = gc("card2") if saved else gc("card")
                    hrow = tk.Frame(hf2, bg=h_bg)
                    hrow.grid(row=i, column=0, columnspan=4,
                              sticky="ew", pady=1)
                    hrow.columnconfigure(1, weight=1)

                    cb = tk.Checkbutton(hrow, variable=var,
                                        bg=h_bg, activebackground=h_bg,
                                        selectcolor=gc("card"), fg=acc,
                                        cursor="hand2")
                    cb.grid(row=0, column=0, padx=(4, 2), pady=SP1)

                    lbl = tk.Label(hrow, text=habit, bg=h_bg,
                                   fg=gc("muted") if saved else gc("pri"),
                                   font=(_F, 10, "overstrike") if saved else F_BODY,
                                   anchor="w", cursor="hand2")
                    lbl.grid(row=0, column=1, sticky="ew", padx=(0, 4))

                    chk = tk.Label(hrow, text="✓" if saved else "",
                                   bg=h_bg, fg=acc,
                                   font=F_BODY_B, width=2)
                    chk.grid(row=0, column=2)

                    dl = tk.Label(hrow, text="×", bg=h_bg,
                                  fg=gc("muted"), font=F_H2,
                                  cursor="hand2", width=2)
                    dl.grid(row=0, column=3, padx=(0, 4))

                    def _on_chk(v=var, h=habit, ck2=ck, lb=lbl,
                                ckl=chk, row_w=hrow):
                        self._habit_data.setdefault(
                            today, {})                             .setdefault(
                            ck2, {})[h] = v.get()
                        new_bg = gc("card2") if v.get() else gc("card")
                        row_w.config(bg=new_bg)
                        lb.config(fg=gc("muted") if v.get() else gc("pri"),
                                  bg=new_bg,
                                  font=(_F, 10, "overstrike") if v.get() else F_BODY)
                        ckl.config(text="✓" if v.get() else "",
                                   bg=new_bg)
                        cb.config(bg=new_bg, activebackground=new_bg)
                        dl.config(bg=new_bg)
                        save_data(self)
                        refresh_all()
                    cb.config(command=_on_chk)

                    def _del(h2=habit, ck2=ck):
                        lst = list(get_habits(ck2))
                        if h2 in lst:
                            lst.remove(h2)
                        set_habits(ck2, lst)
                        self._habit_data.get(today, {}).get(ck2, {}).pop(h2, None)
                        _rebuild()
                        refresh_all()
                    dl.bind("<Button-1>", lambda e, fn=_del: fn())
                    dl.bind("<Enter>", lambda e, w=dl: w.config(fg=gc("danger")))
                    dl.bind("<Leave>", lambda e, w=dl: w.config(fg=gc("muted")))

                    def _edit(e, rw=hrow, h=habit, lb=lbl, ck2=ck, h_bg2=h_bg):
                        lb.grid_remove()
                        ev = tk.StringVar(value=h)
                        ee = tk.Entry(rw, textvariable=ev,
                                      bg=gc("input"), fg=gc("pri"),
                                      relief="flat", bd=0, font=F_BODY,
                                      insertbackground=gc("pri"),
                                      highlightthickness=1,
                                      highlightbackground=acc)
                        ee.grid(row=0, column=1, sticky="ew", padx=(0, 4))
                        ee.focus_set()
                        ee.select_range(0, "end")

                        def _commit(ev2=None, h_old=h, ck3=ck2):
                            new_t = ev.get().strip()
                            if new_t and new_t != h_old:
                                lst = list(get_habits(ck3))
                                if h_old in lst:
                                    lst[lst.index(h_old)] = new_t
                                    set_habits(ck3, lst)
                                    td = self._habit_data.get(today, {}).get(ck3, {})
                                    if h_old in td:
                                        td[new_t] = td.pop(h_old)
                            ee.destroy()
                            _rebuild()
                            refresh_all()
                        ee.bind("<Return>", _commit)
                        ee.bind("<FocusOut>", _commit)
                        ee.bind("<Escape>", lambda ev2: (ee.destroy(), lb.grid()))
                    lbl.bind("<Double-Button-1>", _edit)

                # Add habit row
                add_row = tk.Frame(hf2, bg=gc("card"))
                add_row.grid(row=len(habits), column=0, columnspan=4,
                             sticky="ew", pady=(6, 2))
                add_row.columnconfigure(0, weight=1)
                av = tk.StringVar()
                ae = tk.Entry(add_row, textvariable=av,
                              bg=gc("input"), fg=gc("muted"),
                              relief="flat", bd=0, font=F_BODY,
                              insertbackground=gc("pri"),
                              highlightthickness=1,
                              highlightbackground=gc("border"),
                              highlightcolor=acc)
                ae.pack(side="left", fill="x", expand=True, ipady=5, padx=(0, 6))
                ae.insert(0, "+ type habit name...")

                def _ph_in(e, w=ae):
                    if w.get().startswith("+ type"):
                        w.delete(0, "end")
                        w.config(fg=gc("pri"))

                def _ph_out(e, w=ae):
                    if not w.get().strip():
                        w.delete(0, "end")
                        w.insert(0, "+ type habit name...")
                        w.config(fg=gc("muted"))
                ae.bind("<FocusIn>", _ph_in)
                ae.bind("<FocusOut>", _ph_out)

                def _do_add(e=None, _av=av, _ck=ck):
                    t = _av.get().strip()
                    if not t or t.startswith("+ type"):
                        return
                    lst = list(get_habits(_ck))
                    if t not in lst:
                        lst.append(t)
                        set_habits(_ck, lst)
                    _av.set("")
                    ae.delete(0, "end")
                    ae.insert(0, "+ type habit name...")
                    ae.config(fg=gc("muted"))
                    _rebuild()
                    refresh_all()
                ae.bind("<Return>", _do_add)
                tk.Button(add_row, text="Add", bg=acc, fg="#FFFFFF",
                          font=F_SMALL_B, relief="flat", bd=0,
                          cursor="hand2", padx=SP2, pady=SP1,
                          command=_do_add).pack(side="right")

            _rebuild()

            # Progress bar
            pb = tk.Canvas(card, bg=gc("border"), height=4, highlightthickness=0)
            pb.pack(fill="x")
            cat_pb_refs[cat_key] = (pb, acc)
            pb.bind("<Configure>", lambda e: refresh_all())

            # Footer pts
            foot = tk.Frame(card, bg=gc("card"))
            foot.pack(fill="x", padx=SP2, pady=(2, 6))
            foot.columnconfigure(0, weight=1)
            pl = tk.Label(foot, text="0%", bg=gc("card"), fg=acc,
                          font=F_SMALL_B)
            pl.grid(row=0, column=0, sticky="w")
            cat_score_lbls[cat_key] = pl

        for (lbl, cat), (r, c) in zip(CATS, PARENTS):
            _build_cat(r, c, lbl, cat)

        # ── COL 2 RIGHT: weekly chart + reflection + monthly report ───────────
        right = tk.Frame(main, bg=gc("bg"))
        right.grid(row=0, column=2, rowspan=2, sticky="nsew")
        right.columnconfigure(0, weight=1)
        right.rowconfigure(0, weight=1)
        right.rowconfigure(1, weight=1)
        right.rowconfigure(2, weight=1)

        # Weekly chart card
        wk_card = _card(right, row=0, col=0, accent=gc("health"),
                        pady=(0, 6))
        wk_card.columnconfigure(0, weight=1)
        wk_card.rowconfigure(1, weight=1)
        _section(wk_card, "📊 WEEKLY SCORE", gc("health"))
        chart_area = tk.Frame(wk_card, bg=gc("card"))
        chart_area.pack(fill="both", expand=True, padx=SP2, pady=SP2)

        def _draw_chart():
            for w in chart_area.winfo_children():
                w.destroy()
            ws = week_scores()
            if HAS_MPL:
                fig_bg = gc("card")
                fig = Figure(figsize=(2.8, 1.8), dpi=80, facecolor=fig_bg)
                ax = fig.add_subplot(111, facecolor=fig_bg)
                labels = [d for d, _ in ws]
                scores = [s for _, s in ws]
                colors = [(gc("success") if s >= 70 else
                           gc("warning") if s >= 40 else gc("danger"))
                          for s in scores]
                ax.bar(range(7), scores, color=colors, width=0.6)
                ax.plot(range(7), scores, color=gc("sec"),
                        linewidth=1, marker="o", markersize=3)
                for i, (lbl, sc) in enumerate(ws):
                    if sc > 0:
                        ax.text(i, sc + 2, str(sc), color=gc("sec"),
                                fontsize=6, ha="center")
                ax.set_xticks(range(7))
                ax.set_xticklabels(labels, fontsize=7)
                ax.set_ylim(0, 115)
                ax.tick_params(colors=gc("muted"), labelsize=7)
                for spine in ax.spines.values():
                    spine.set_color(gc("border"))
                fig.tight_layout(pad=0.4)
                cv_w = FigureCanvasTkAgg(fig, master=chart_area)
                cv_w.draw()
                cv_w.get_tk_widget().pack(fill="both", expand=True)
            else:
                cv = tk.Canvas(chart_area, bg=gc("card"),
                               height=100, highlightthickness=0)
                cv.pack(fill="both", expand=True)

                def _fb(e=None):
                    cv.delete("all")
                    W = cv.winfo_width()
                    H = cv.winfo_height()
                    if W < 10:
                        return
                    cw = W // 7
                    for i, (lbl, sc) in enumerate(ws):
                        bh = int(sc / 100 * (H - 22))
                        x0 = i * cw + cw // 5
                        col = (gc("success") if sc >= 70 else
                               gc("warning") if sc >= 40 else gc("danger"))
                        cv.create_rectangle(x0, H - 18 - bh, x0 + cw * 3 // 5, H - 18,
                                            fill=col, outline="")
                        cv.create_text(x0 + cw // 4, H - 8, text=lbl,
                                       fill=gc("muted"), font=F_XS)
                        if sc > 0:
                            cv.create_text(x0 + cw // 4, H - 22 - bh, text=str(sc),
                                           fill=gc("sec"), font=F_XS)
                cv.bind("<Configure>", _fb)
                win.after(100, _fb)

        _draw_chart()

        # Best/worst this week
        wk_vals = [s for _, s in week_scores()]
        best_day_score = max(wk_vals) if wk_vals else 0
        worst_day_score = min(wk_vals) if wk_vals else 0
        bw_frame = tk.Frame(wk_card, bg=gc("card"))
        bw_frame.pack(fill="x", padx=SP2, pady=(0, 6))
        tk.Label(bw_frame, text=f"◈  Best: {best_day_score}%",
                 bg=gc("card"), fg=gc("success"),
                 font=F_XS).pack(side="left", padx=(0, 8))
        tk.Label(bw_frame, text=f"📉 Worst: {worst_day_score}%",
                 bg=gc("card"), fg=gc("danger"),
                 font=F_XS).pack(side="left")

        # Reflection card
        ref_card = _card(right, row=1, col=0, accent=gc("mind"),
                         pady=(0, 6))
        ref_card.columnconfigure(0, weight=1)
        ref_card.rowconfigure(1, weight=1)
        _section(ref_card, "📝 END OF DAY REFLECTION", gc("mind"))
        _ref_key = f"__reflection_{today}"
        ref_ta = tk.Text(ref_card, bg=gc("input"), fg=gc("pri"),
                         font=F_BODY, relief="flat", bd=0,
                         insertbackground=gc("pri"),
                         highlightthickness=0,
                         wrap="word", padx=SP2, pady=SP2,
                         spacing1=2, spacing2=1, spacing3=2,
                         height=5)
        ref_ta.pack(fill="both", expand=True, padx=SP2, pady=SP2)
        saved_ref = self._habit_data.get(_ref_key, "")
        if saved_ref:
            ref_ta.insert("1.0", saved_ref)
        else:
            ref_ta.insert("1.0", "What did you accomplish today? What will you improve tomorrow?")
            ref_ta.config(fg=gc("muted"))

            def _ref_focus(e):
                ph = "What did you accomplish today? What will you improve tomorrow?"
                if ref_ta.get("1.0", "end-1c") == ph:
                    ref_ta.delete("1.0", "end")
                    ref_ta.config(fg=gc("pri"))
                ref_ta.unbind("<FocusIn>")
            ref_ta.bind("<FocusIn>", _ref_focus)

        def _save_ref(e=None):
            txt = ref_ta.get("1.0", "end-1c")
            ph = "What did you accomplish today? What will you improve tomorrow?"
            if txt == ph:
                return
            self._habit_data[_ref_key] = txt
            save_data(self)
        ref_ta.bind("<KeyRelease>", _save_ref)
        ref_ta.bind("<FocusOut>", _save_ref)

        # Monthly report card
        rep_card = _card(right, row=2, col=0, accent=gc("money"))
        rep_card.columnconfigure(0, weight=1)
        _section(rep_card, "📅 MONTHLY REPORT", gc("money"))

        import datetime as _dt2
        this_month = str(_dt2.date.today())[:7]
        m_scores = []
        for ds, dd in self._habit_data.items():
            if not ds.startswith(this_month):
                continue
            if len(ds) != 10 or not ds.replace("-", "").isdigit():
                continue
            total = sum(len(get_habits(c)) for _, c in CATS)
            done = sum(1 for cd in dd.values()
                       if isinstance(cd, dict) for v in cd.values() if v)
            m_scores.append(int(done / max(total, 1) * 100))
        avg = int(sum(m_scores) / len(m_scores)) if m_scores else 0
        streak = calc_streak()

        rep_inner = tk.Frame(rep_card, bg=gc("card"))
        rep_inner.pack(fill="x", padx=SP2, pady=SP2)
        rep_inner.columnconfigure(1, weight=1)
        for i, (k, v, col) in enumerate([
            ("Avg Score", f"{avg}/100", gc("pri")),
            ("Streak", f"🔥 {streak} days", gc("warning")),
            ("Days Done", f"{len(m_scores)}", gc("money")),
        ]):
            tk.Label(rep_inner, text=f"{k}:",
                     bg=gc("card"), fg=gc("muted"),
                     font=F_XS).grid(row=i, column=0, sticky="w", pady=SP1)
            tk.Label(rep_inner, text=v,
                     bg=gc("card"), fg=col,
                     font=F_SMALL_B).grid(row=i, column=1,
                                          sticky="w", padx=(8, 0), pady=SP1)

        # ══════════════════════════════════════════════════════════════════════
        # REFRESH ALL
        # ══════════════════════════════════════════════════════════════════════
        def refresh_all():
            sc = calc_score()
            streak_n = calc_streak()
            # Score ring
            _draw_score_ring(sc)
            # Streak
            streak_lbl.config(text=f"🔥 {streak_n} days")
            # Alert — if past 6pm and score < 50%
            import datetime as _dt3
            hr = _dt3.datetime.now().hour
            remaining = sum(1 for _, c in CATS
                            for h in get_habits(c)
                            if not self._habit_data.get(today, {})
                            .get(c, {}).get(h, False))
            if hr >= 18 and sc < 50:
                alert_lbl.config(text=f"⚠ {remaining} habits remaining!")
            else:
                alert_lbl.config(text="✓  Perfect Day" if sc == 100 else "")
            # Category progress bars + labels
            for _, cat in CATS:
                pct = calc_cat_pct(cat)
                if cat in cat_score_lbls:
                    cat_score_lbls[cat].config(text=f"{pct}%")
                if cat in cat_pb_refs:
                    pb_cv, pb_ac = cat_pb_refs[cat]
                    pw = pb_cv.winfo_width()
                    if pw > 2:
                        pb_cv.delete("all")
                        fill = int(pw * pct / 100)
                        pb_cv.create_rectangle(0, 0, pw, 4,
                                               fill=gc("border"), outline="")
                        if fill > 0:
                            pb_cv.create_rectangle(0, 0, fill, 4,
                                                   fill=pb_ac, outline="")

        win.after(120, refresh_all)

        def _on_close():
            # Geometry saved by _setup_window's debounced handler
            save_data(self)
            try:
                delattr(self, win_attr)
            except Exception as _e:
                log.debug("suppressed: %s", _e)
            win.destroy()
        win.protocol("WM_DELETE_WINDOW", _on_close)

    def on_close(self):
        """Clean shutdown — cancel timers, save data, destroy window."""
        try:
            if hasattr(self, "_tick_id"):
                self.after_cancel(self._tick_id)
        except Exception:
            pass
        # Close RUNNING task-timer sessions before saving. Quitting with a
        # timer running used to leave `end` as None forever: task_timers
        # isn't persisted, so nothing on the next launch knew the session
        # was open, and it inflated the task's session count for good.
        try:
            for t in list(self.tasks) + list(self.tasks_focus):
                if t["id"] in self.task_timers:
                    self._stop_timer(t)
        except Exception as e:
            log.debug("close running sessions: %s", e)
        # Fold today's time into daily_history once more (tick saves 15s).
        try:
            self._record_today()
        except Exception as e:
            log.debug("final record_today: %s", e)
        try:
            state = self.wm_state()
            if state == "zoomed":
                self._last_geometry = "zoomed"
            elif hasattr(self, "_last_geometry") and self._last_geometry:
                pass
        except Exception:
            pass
        self._music_stop()
        save_data(self)
        # Released only after the final save, so a copy started the
        # instant this one closes cannot read a half-written file.
        release_lock()
        self._cancel_all_after()
        self.destroy()


# ── Run ───────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import traceback
    try:
        # Single-instance check BEFORE the app is built, so a second copy
        # never gets far enough to schedule an autosave. Asked as a
        # question rather than enforced: the lock can only ever be
        # evidence, and a user who knows the other window is dead should
        # not be locked out of their own tasks.
        _ok, _other = acquire_lock()
        if not _ok:
            import tkinter as _tkl
            from tkinter import messagebox as _mb
            _r = _tkl.Tk()
            _r.withdraw()
            if not _mb.askyesno(
                    "Task Tracker is already running",
                    "Another copy of Task Tracker looks like it is already "
                    "open (process %d).\n\n"
                    "Running two copies at once WILL lose data: both save "
                    "every few seconds, and whichever writes last silently "
                    "overwrites the other.\n\n"
                    "Open anyway?" % _other):
                _r.destroy()
                raise SystemExit(0)
            _r.destroy()
            with open(LOCK_FILE, "w", encoding="utf-8") as _lf:
                _lf.write("%d,%d" % (os.getpid(), int(time.time())))
        app = TaskTrackerApp()
        app.protocol("WM_DELETE_WINDOW", app.on_close)
        if LOAD_NOTICE["msg"]:
            # A dialog, not a toast that fades. If the app has just
            # rewound the user's data to an earlier day, they need to
            # know BEFORE they start typing on top of it — a message
            # they might miss is how a recovery becomes a second loss.
            def _say_notice(_m=LOAD_NOTICE["msg"], _k=LOAD_NOTICE["kind"]):
                from tkinter import messagebox as _mb2
                (_mb2.showerror if _k == "error" else _mb2.showwarning)(
                    "Task Tracker — data recovery",
                    _m + "\n\nBackups are kept in:\n" + BACKUP_DIR)
            app.after(700, _say_notice)
        app.mainloop()
    except SystemExit:
        raise
    except Exception:
        # Show error in a simple window so it doesn't silently disappear.
        # The exception object isn't bound — traceback.format_exc() below
        # already carries the full stack, which is what gets displayed.
        tb = traceback.format_exc()
        # ALSO write it to a file, and to stderr. A traceback that exists
        # only as pixels in a window is one the user has to retype by
        # hand to report; if the window itself fails to open (a Tk that
        # can't start is exactly the kind of thing that lands here) it
        # is lost entirely. The file is the copy that survives.
        _logp = os.path.join(os.path.expanduser("~"),
                             "task_tracker_startup_error.txt")
        try:
            with open(_logp, "w", encoding="utf-8") as _lf:
                _lf.write("Task Tracker startup error\n%s\nPython %s\n\n%s"
                          % (time.strftime("%Y-%m-%d %H:%M:%S"),
                             sys.version, tb))
        except Exception:
            _logp = "(could not be written)"
        try:
            sys.stderr.write(tb)
        except Exception:
            pass
        # A lock this run may have taken must not outlive it — otherwise
        # a crash on startup makes the NEXT launch ask "already running?"
        try:
            release_lock()
        except Exception:
            pass
        import tkinter as _tk
        _err = _tk.Tk()
        _err.title("Startup Error")
        _err.geometry("760x420")
        _err.configure(bg="#1a0000")
        _tk.Label(_err, text="Task Tracker failed to start:",
                  bg="#1a0000", fg="#ff6666",
                  font=(_FM, 10, "bold")).pack(pady=(16, 4))
        txt = _tk.Text(_err, bg="#220000", fg="#ffaaaa",
                       font=(_FM, 9), wrap="word")
        txt.pack(fill="both", expand=True, padx=SP3, pady=(0, 6))
        txt.insert("1.0", tb)
        _tk.Label(_err, text="Saved to:  " + _logp,
                  bg="#1a0000", fg="#ff9999", font=(_FM, 8)).pack(pady=(0, 4))

        def _copy_tb():
            try:
                _err.clipboard_clear()
                _err.clipboard_append(tb)
                _btn.config(text="Copied")
            except Exception:
                _btn.config(text="Copy failed")
        _btn = _tk.Button(_err, text="Copy error", command=_copy_tb,
                          bg="#3a0000", fg="#ffcccc", relief="flat",
                          bd=0, padx=14, pady=5, cursor="hand2",
                          activebackground="#550000",
                          activeforeground="#ffffff")
        _btn.pack(pady=(0, 12))
        # Selectable, so the text can be copied by hand too. It was
        # state="disabled", which in Tk blocks selection as well as
        # editing — the traceback was readable and nothing else.
        txt.config(state="normal")
        _err.mainloop()
