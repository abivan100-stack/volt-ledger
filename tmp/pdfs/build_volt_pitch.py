from pathlib import Path
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as pdfcanvas
from pypdf import PdfReader, PdfWriter
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether
)

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output" / "pdf" / "Volt_Ledger_7_Minute_Shark_Tank_Script.pdf"
OUT.parent.mkdir(parents=True, exist_ok=True)

pdfmetrics.registerFont(TTFont("Arial", r"C:\Windows\Fonts\arial.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Bold", r"C:\Windows\Fonts\arialbd.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Italic", r"C:\Windows\Fonts\ariali.ttf"))

PAGE_W, PAGE_H = A4
INK = colors.HexColor("#18211D")
GREEN = colors.HexColor("#145C3D")
LIME = colors.HexColor("#DCEB68")
SUN = colors.HexColor("#F5B942")
CREAM = colors.HexColor("#F6F4EA")
MINT = colors.HexColor("#E7F1EA")
PALE = colors.HexColor("#F1F3EE")
RED = colors.HexColor("#9E2F2F")
GREY = colors.HexColor("#5D6862")
WHITE = colors.white

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="CoverKicker", fontName="Arial-Bold", fontSize=10, leading=13, textColor=GREEN, spaceAfter=6))
styles.add(ParagraphStyle(name="CoverTitle", fontName="Arial-Bold", fontSize=28, leading=31, textColor=INK, spaceAfter=9))
styles.add(ParagraphStyle(name="CoverSub", fontName="Arial", fontSize=11, leading=16, textColor=GREY, spaceAfter=12))
styles.add(ParagraphStyle(name="H1x", fontName="Arial-Bold", fontSize=19, leading=23, textColor=INK, spaceAfter=9))
styles.add(ParagraphStyle(name="H2x", fontName="Arial-Bold", fontSize=12, leading=15, textColor=GREEN, spaceBefore=8, spaceAfter=5))
styles.add(ParagraphStyle(name="Bodyx", fontName="Arial", fontSize=9.2, leading=13, textColor=INK, spaceAfter=5))
styles.add(ParagraphStyle(name="Smallx", fontName="Arial", fontSize=7.8, leading=10.5, textColor=GREY))
styles.add(ParagraphStyle(name="Cue", fontName="Arial-Bold", fontSize=8.2, leading=11, textColor=GREEN))
styles.add(ParagraphStyle(name="Say", fontName="Arial", fontSize=10, leading=14, textColor=INK))
styles.add(ParagraphStyle(name="Optional", fontName="Arial-Italic", fontSize=8.2, leading=11.5, textColor=GREY))
styles.add(ParagraphStyle(name="White", fontName="Arial-Bold", fontSize=9, leading=12, textColor=WHITE))
styles.add(ParagraphStyle(name="Center", fontName="Arial-Bold", fontSize=9, leading=12, textColor=INK, alignment=1))
styles.add(ParagraphStyle(name="QAQ", fontName="Arial-Bold", fontSize=9.2, leading=12, textColor=INK))
styles.add(ParagraphStyle(name="QAA", fontName="Arial", fontSize=8.6, leading=12, textColor=INK))


def P(text, style="Bodyx"):
    return Paragraph(text, styles[style])


def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(INK)
    canvas.rect(0, PAGE_H - 11 * mm, PAGE_W, 11 * mm, fill=1, stroke=0)
    canvas.setFont("Arial-Bold", 8)
    canvas.setFillColor(LIME)
    canvas.drawString(15 * mm, PAGE_H - 7.2 * mm, "VOLT / 7-MINUTE PITCH")
    canvas.setFont("Arial", 7.5)
    canvas.setFillColor(colors.HexColor("#CBD3CE"))
    canvas.drawRightString(PAGE_W - 15 * mm, PAGE_H - 7.2 * mm, "Velammal Schools - rehearsal copy")
    canvas.setStrokeColor(colors.HexColor("#D9DDD8"))
    canvas.line(15 * mm, 12 * mm, PAGE_W - 15 * mm, 12 * mm)
    canvas.setFont("Arial", 7.5)
    canvas.setFillColor(GREY)
    canvas.drawString(15 * mm, 7.5 * mm, "Synthetic demonstration - not a real meter reading or payment system")
    canvas.drawRightString(PAGE_W - 15 * mm, 7.5 * mm, f"{doc.page}")
    canvas.restoreState()


doc = SimpleDocTemplate(
    str(OUT), pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm,
    topMargin=18 * mm, bottomMargin=16 * mm, title="Volt Ledger - 7 Minute Shark Tank Script",
    author="Volt team"
)
story = []


def section_title(kicker, title, note=None):
    story.append(P(kicker.upper(), "CoverKicker"))
    story.append(P(title, "H1x"))
    if note:
        story.append(P(note, "CoverSub"))


def info_box(title, body, bg=MINT, accent=GREEN):
    t = Table([[P(title, "Cue")], [P(body, "Bodyx")]], colWidths=[doc.width - 4 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("BOX", (0, 0), (-1, -1), 0.8, accent),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.extend([t, Spacer(1, 7)])


def script_block(time, speaker, role, action, lines, optional=None, accent=GREEN):
    head = Table([[P(time, "White"), P(f"{speaker} - {role}", "White")]], colWidths=[34 * mm, doc.width - 34 * mm])
    head.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), accent),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    cells = [[P("DO / SHOW", "Cue"), P(action, "Bodyx")], [P("SAY", "Cue"), P(lines, "Say")]]
    if optional:
        cells.append([P("FLEX LINE", "Cue"), P(optional, "Optional")])
    body = Table(cells, colWidths=[25 * mm, doc.width - 25 * mm])
    body.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), PALE),
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#CAD0CB")),
        ("INNERGRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D8DDD9")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.extend([KeepTogether([head, body]), Spacer(1, 8)])


# Cover / run sheet
story.append(Spacer(1, 12 * mm))
story.append(P("VOLT - LOCAL ENERGY LEDGER", "CoverKicker"))
story.append(P("7-Minute Shark Tank<br/>Pitch + Demo + Judge Q&amp;A", "CoverTitle"))
story.append(P("A flexible, stage-ready script for three presenters. Replace A, B and C with your names before printing.", "CoverSub"))
info_box("THE ONE-SENTENCE IDEA", "Volt models neighbours exchanging surplus rooftop-solar energy at a fair community rate, while every settlement is recorded in a tamper-evident ledger.", bg=colors.HexColor("#EFF6C9"))

story.append(P("Speaker assignment", "H2x"))
roles = [
    [P("A - Persuasive lead", "White"), P("B - Technical lead", "White"), P("C - Simple explainer", "White")],
    [P("Hook, problem, value, closing<br/><b>Target: 2 min 10 sec</b>", "Smallx"), P("Website demo, specs, proof<br/><b>Target: 2 min 15 sec</b>", "Smallx"), P("Three steps, model, tamper result<br/><b>Target: 1 min 25 sec</b>", "Smallx")],
]
rt = Table(roles, colWidths=[doc.width / 3] * 3)
rt.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), INK),
    ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
    ("BACKGROUND", (0, 1), (-1, 1), CREAM),
    ("BOX", (0, 0), (-1, -1), 0.6, GREEN),
    ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#BBC4BE")),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("TOPPADDING", (0, 0), (-1, -1), 7),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
]))
story.extend([rt, Spacer(1, 9)])

story.append(P("Exact run of show", "H2x"))
timeline = [
    [P("CLOCK", "White"), P("OWNER", "White"), P("SECTION", "White"), P("LENGTH", "White")],
    [P("0:00-0:30"), P("A"), P("Hook"), P("0:30")],
    [P("0:30-1:05"), P("A"), P("Problem and price gap"), P("0:35")],
    [P("1:05-1:45"), P("C"), P("Generate - Log - Settle"), P("0:40")],
    [P("1:45-2:55"), P("B"), P("Website and neighbourhood demo"), P("1:10")],
    [P("2:55-3:40"), P("C"), P("Physical model + tamper result"), P("0:45")],
    [P("3:40-4:30"), P("A"), P("Value and business logic"), P("0:50")],
    [P("4:30-5:35"), P("B"), P("Technical credibility and limits"), P("1:05")],
    [P("5:35-5:50"), P("A"), P("Close"), P("0:15")],
    [P("5:50-7:00"), P("All"), P("Judge Q&amp;A"), P("1:10")],
]
tt = Table(timeline, colWidths=[30 * mm, 18 * mm, 94 * mm, 22 * mm], repeatRows=1)
tt.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), GREEN),
    ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, PALE]),
    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CCD2CD")),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("TOPPADDING", (0, 0), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
]))
story.extend([tt, Spacer(1, 7)])
story.append(P("Timing rule: B keeps a phone timer where only the team can see it. If the clock reaches 5:20, B skips the optional flex line and moves straight to A's closing.", "Smallx"))
story.append(PageBreak())

# Script part 1
section_title("Script / Part 1", "Open with the problem, then make the idea simple", "Words in italics are optional. Natural pauses and one extra sentence are safe; keep each handoff line unchanged.")
script_block(
    "0:00-0:30", "A", "Persuasive lead", "Stand centre. Do not touch the screen yet. Pause after the question.",
    "Good morning, judges. Imagine two homes on the same street. One roof is producing extra solar power, while the home next door needs electricity. Why should the first family sell that energy cheaply to the grid, only for the second family to buy it back at a much higher price? <b>Volt helps the street share that value.</b>",
    "If the room feels responsive: 'The energy travels only a short distance. We believe the benefit should stay just as local.'"
)
script_block(
    "0:30-1:05", "A", "Persuasive lead", "Show the landing-page price comparison. Point once to each number.",
    "Our prototype uses the comparison shown here: the grid buys surplus at about <b>₹3 per unit</b> and sells electricity at about <b>₹8</b>. Volt models a community rate near <b>₹5.50</b>, plus a small <b>₹0.40 network fee</b>. In this example, the solar owner earns ₹2.50 more per unit, the neighbour saves ₹2.10, and the network can sustain itself.",
    "Say 'illustrative rate' if a judge asks whether this is an official tariff. Do not call it a guaranteed saving."
)
script_block(
    "1:05-1:45", "C", "Simple explainer", "Take one small step forward. Use three fingers. Speak slowly.",
    "Volt works in just three steps. <b>First, Generate:</b> a rooftop makes more solar energy than that home needs. <b>Second, Log:</b> the extra energy is recorded clearly. <b>Third, Settle:</b> a nearby home receives the local energy, and the record is updated. So the simple idea is: local energy, a fairer rate, and a record people can check. Now B will show you our working website.",
    "Memory rescue: 'Generate. Log. Settle. Local energy with a record people can trust.'"
)
info_box("C'S SAFETY RULE", "C does not explain code, law, meter hardware, or detailed pricing. If interrupted with a hard question: 'B can explain the technical side of that,' then look at B.", bg=colors.HexColor("#FFF4D8"), accent=SUN)
story.append(PageBreak())

# Demo
section_title("Script / Part 2", "Demonstrate the system without getting trapped by the screen", "The spoken story matters more than perfect clicking. If one control fails, continue with the visible page and describe the intended result honestly.")
script_block(
    "1:45-2:55", "B", "Technical lead", "Open the ledger. Show the 10-home map, household cards, day selector, then the chain. Do not open every panel.",
    "This is a <b>synthetic neighbourhood of ten households in Nolambur, Chennai</b>. Some homes are producers with surplus rooftop solar; others are consumers. The map shows local energy flow, and the household cards show generation, demand, imports, exports and balances. We can switch between a sunny weekday, cloudy day, weekend and heatwave. The same inputs always replay the same result, so the demonstration is repeatable rather than random. Every trade is then added to this ledger with its time, seller, buyer, energy and credit.",
    "If ahead of time: 'The dashboard also shows carbon avoided, grid dependence, neighbourhood autonomy and fairness.'"
)
script_block(
    "2:55-3:15", "C", "Simple explainer", "Point to the physical model. Use the version below that matches what actually works.",
    "Our physical model makes the same idea visible: one home has extra solar energy and another home needs it. The lights or indicators show energy moving locally, while the website keeps the detailed record.",
    "If the model is not fully working: 'This model represents the planned energy flow; the website is the working simulation.' Never claim that it measures real electricity unless it truly does."
)
script_block(
    "3:15-3:40", "C", "Simple explainer", "B runs the tamper test while C speaks. C points to the failed rows and 'INTEGRITY VOID'.",
    "The most important part is trust. When we change even one past energy value, that record and every record after it fail verification. The screen says <b>INTEGRITY VOID</b>, and settlement stops. When the original value is restored, the chain verifies again. So the system does not pretend an edited record is valid.",
    "Memory rescue: 'Change one old value, the chain breaks, and settlement stops.'"
)
info_box("IF THE TAMPER CLICK FAILS", "B says: 'The intended result is already built into the ledger: changing one old value invalidates that row and every later row.' Do not keep clicking. Move on within five seconds.", bg=colors.HexColor("#FBE7E7"), accent=RED)
story.append(PageBreak())

# Value, tech, close
section_title("Script / Part 3", "Show why it matters, prove credibility, and close", "Keep the tone confident but honest: Volt is a tested synthetic prototype, not yet a meter-backed billing product.")
script_block(
    "3:40-4:30", "A", "Persuasive lead", "Return to centre. Let the demo remain visible behind you.",
    "Volt creates value for all three sides. The solar owner can receive more than the basic export price. The neighbour can pay less than the retail example. And the small network fee gives the platform a simple revenue path. Beyond money, the dashboard shows how much demand is met without the grid, the carbon avoided by local trading, and whether the benefit is distributed fairly. We are not only asking, 'Did energy move?' We are also asking, 'Was the outcome useful and fair?'",
    "If judges look rushed, end after 'simple revenue path' and hand over."
)
script_block(
    "4:30-5:35", "B", "Technical lead", "Show the hash-chain or proof-inspector panel. Keep the explanation at judge level.",
    "Technically, Volt uses a <b>SHA-256 hash chain</b>. Each ledger entry is sealed using its own contents and the previous entry's seal. If an old entry changes, the seals no longer match. The simulation is deterministic: it models solar and demand by time of day, household and weather scenario, without random results changing between demonstrations. The project can also export the ledger as CSV or PDF, and the larger system supports organisations, roles, simulation runs, immutable settlements and correction entries. One important limit: today's demonstration is synthetic. It is not connected to real smart meters and it does not move real money. The next step is a controlled pilot with approved metering and regulatory partners.",
    "Only if asked: the website uses React and TypeScript; the server uses an API, MongoDB and a separate simulation worker."
)
script_block(
    "5:35-5:50", "A", "Persuasive lead", "All three stand in one line. Finish looking at the judges, not the screen.",
    "Volt turns rooftop surplus into neighbourhood value - <b>fairer for families, visible to the community, and difficult to alter silently.</b> We are Team Volt, and we are ready for your questions.",
    "Short emergency close: 'Volt keeps local energy value local - fairly and transparently. Thank you.'"
)
info_box("AT 5:50", "Stop presenting even if you skipped a line. A says, 'We are ready for your questions.' This protects the full 1 minute 10 seconds reserved for judge Q&amp;A.", bg=colors.HexColor("#EFF6C9"))
story.append(PageBreak())

# Q&A
section_title("5:50-7:00 / Judge Q&A", "Short answers that stay truthful", "A answers business and impact. B answers technology and feasibility. C answers only the three-step idea or the model. Keep each answer under 20 seconds, then stop.")
qa_data = [
    ("What exactly is new here?", "A", "Volt combines a local community-rate model with a visible, tamper-evident settlement record. It also shows autonomy, carbon impact and fairness, not only the energy transfer."),
    ("Is this blockchain?", "B", "It is a SHA-256 hash chain, not a public blockchain. That makes changes detectable, but there is no distributed consensus in this prototype. We describe it as tamper-evident, not tamper-proof."),
    ("Does it use real electricity data?", "B", "Not yet. The current neighbourhood and outcomes are synthetic and repeatable. A real pilot would need approved smart-meter data, consent and utility or regulatory integration."),
    ("How do you earn money?", "A", "The website models a small network fee of ₹0.40 per unit. The exact commercial rate would need validation in a pilot and must fit local rules."),
    ("Why would both homes join?", "A", "In our illustrative comparison, the seller receives more than the grid export price and the buyer pays less than the retail price. Both also get a record they can inspect."),
    ("What happens if someone edits a transaction?", "C", "The changed entry and every later entry fail verification, the ledger shows INTEGRITY VOID, and settlement stops until the original data is restored."),
    ("Can corrections be made?", "B", "History is not secretly rewritten. In the full design, an authorised correction is added as a new adjustment event, so the original evidence remains visible."),
    ("What if it is cloudy or demand changes?", "C", "We can switch the demonstration between sunny, cloudy, weekend and heatwave scenarios. The household generation and demand update for that scenario."),
    ("What is your next step?", "A", "First, finish and test the physical demonstration. Then run a small controlled pilot using approved meter inputs, validate the pricing, and work with the required energy partners before any real settlement."),
    ("How is this scalable?", "B", "The software already separates organisations, roles, simulations and settlement history. Scaling beyond a prototype would mainly require reliable meter integration, operations and regulatory approval."),
]
rows = [[P("LIKELY QUESTION", "White"), P("WHO", "White"), P("ANSWER", "White")]]
for q, who, ans in qa_data:
    rows.append([P(q, "QAQ"), P(who, "Center"), P(ans, "QAA")])
qt = Table(rows, colWidths=[52 * mm, 14 * mm, doc.width - 66 * mm], repeatRows=1)
qt.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), GREEN),
    ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, PALE]),
    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD1CC")),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 5),
    ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ("TOPPADDING", (0, 0), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
]))
story.append(qt)
story.append(PageBreak())

# Rehearsal + cue card
section_title("Final rehearsal page", "Make tomorrow feel controlled", "Run the pitch twice tonight and once tomorrow. Do not attempt major new features before presenting.")
story.append(P("60-second setup checklist", "H2x"))
check = [
    "Open the landing page and ledger before your turn; keep both ready.",
    "Choose Sunny Weekday and make sure the ledger already contains entries.",
    "Test the tamper action once, then restore the original value.",
    "Put the physical model in its starting state and decide who touches it.",
    "Keep an offline screenshot or the existing project screenshots ready as backup.",
    "Turn off notifications; connect power; set browser zoom so judges can read the screen.",
    "Write your three names over A, B and C. B starts the hidden timer at A's first word.",
]
for item in check:
    story.append(P(f"□&nbsp;&nbsp;{item}", "Bodyx"))

story.append(P("Three rules on stage", "H2x"))
rules = Table([
    [P("1", "Center"), P("Do not memorise every word. Memorise the first line, the handoffs and the final line.", "Bodyx")],
    [P("2", "Center"), P("Never call the data live or real. Say synthetic demonstration, simulated neighbourhood or illustrative rate.", "Bodyx")],
    [P("3", "Center"), P("If something fails, explain what should happen once, then continue. Confidence is better than repeated clicking.", "Bodyx")],
], colWidths=[14 * mm, doc.width - 14 * mm])
rules.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (0, -1), LIME),
    ("BOX", (0, 0), (-1, -1), 0.6, GREEN),
    ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD1CC")),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("TOPPADDING", (0, 0), (-1, -1), 7),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
]))
story.extend([rules, Spacer(1, 10)])
story.append(P("Pocket memory cards", "H2x"))
cards = [
    [P("A / PERSUADE", "White"), P("B / PROVE", "White"), P("C / SIMPLIFY", "White")],
    [P("Two homes, one unfair gap.<br/>₹3 → ₹8 vs community rate.<br/>Value: seller, buyer, network.<br/><b>Close:</b> fair, visible, hard to alter.", "Smallx"),
     P("10 synthetic homes.<br/>Four day types; repeatable model.<br/>SHA-256 links each entry.<br/>Honest limit: no real meters or money.", "Smallx"),
     P("Generate.<br/>Log.<br/>Settle.<br/>Change old value → chain fails → settlement stops.", "Smallx")],
]
ct = Table(cards, colWidths=[doc.width / 3] * 3)
ct.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), INK),
    ("BACKGROUND", (0, 1), (-1, 1), CREAM),
    ("BOX", (0, 0), (-1, -1), 0.7, GREEN),
    ("INNERGRID", (0, 0), (-1, -1), 0.5, GREEN),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 7),
    ("RIGHTPADDING", (0, 0), (-1, -1), 7),
    ("TOPPADDING", (0, 0), (-1, -1), 7),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
]))
story.extend([ct, Spacer(1, 10)])
info_box("FINAL TEAM LINE", "A: 'We are Team Volt.' &nbsp;&nbsp; All three: 'Thank you.'", bg=colors.HexColor("#EFF6C9"))
story.append(P("Source basis: Volt repository README, CONTEXT.md, landing-page copy, simulation logic, ledger/tamper flow, metrics, proof inspector and system architecture. No hardware capability was invented; the physical-model line is deliberately conditional.", "Smallx"))

doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)

# Overlay the top banner on every page after layout. This keeps the banner
# consistent even when ReportLab changes page templates around large tables.
overlay_stream = BytesIO()
overlay_canvas = pdfcanvas.Canvas(overlay_stream, pagesize=A4)
overlay_canvas.setFillColor(INK)
overlay_canvas.rect(0, PAGE_H - 11 * mm, PAGE_W, 11 * mm, fill=1, stroke=0)
overlay_canvas.setFont("Arial-Bold", 8)
overlay_canvas.setFillColor(LIME)
overlay_canvas.drawString(15 * mm, PAGE_H - 7.2 * mm, "VOLT / 7-MINUTE PITCH")
overlay_canvas.setFont("Arial", 7.5)
overlay_canvas.setFillColor(colors.HexColor("#CBD3CE"))
overlay_canvas.drawRightString(PAGE_W - 15 * mm, PAGE_H - 7.2 * mm, "Velammal Schools - rehearsal copy")
overlay_canvas.save()
overlay_stream.seek(0)
overlay_page = PdfReader(overlay_stream).pages[0]
reader = PdfReader(str(OUT))
writer = PdfWriter()
for page in reader.pages:
    page.merge_page(overlay_page)
    writer.add_page(page)
temp_out = OUT.with_suffix(".tmp.pdf")
with temp_out.open("wb") as stream:
    writer.write(stream)
temp_out.replace(OUT)
print(OUT)
