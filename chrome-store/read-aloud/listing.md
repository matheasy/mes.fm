# MES Read Aloud 1.12.0

Upload `store.zip`; images: `icon-128.png` (store icon), `screenshot-*.png`, `promo-440x280.png`.

## Item name (from the manifest)

MES Read Aloud

## Summary (from the manifest, max 132)

Reads web pages, Google Docs, PDFs and Word files aloud, highlighting each word and sentence. Free, private, no tracking.

## Description

Listen to any web page instead of reading it. MES Read Aloud finds the article text (or reads what you select) and speaks it with the voices of your browser and computer, highlighting the word and sentence as it goes.

What it does
• Reads web pages, a selection and Google Docs.
• PDF, Word (.docx) and text files (.txt, .md, .rtf, .csv, code) open in the free MES PDF Editor, Word Viewer or Text Viewer on mes.fm, where they look like the real document and Read aloud highlights each word on the page. The file is passed straight from the extension to that page in your browser; it is not uploaded.
• Highlights the current word and sentence, and scrolls with the reading.
• Floating player you can drag or shrink: play / pause, previous / next sentence, speed, voice, double-click any word to jump there.
• Searchable voice list grouped by language; voices that fail to speak are skipped automatically.
• Setups such as Default, Study and Quick listen; keyboard shortcut Alt+Shift+R and a right-click menu.

Free, no ads, no account and no tracking. The extension sends nothing to MES; online voices offered by your browser are run by their provider (see the privacy policy). Made by MES (mes.fm). Works in Chrome, Brave, Edge and other Chromium browsers.

## Category

Make Chrome Yours > Accessibility

## Language

English

## Homepage URL

https://mes.fm/read-aloud

## Support URL

https://mes.fm/contact

## Single purpose

Read web pages, selections, Google Docs, PDFs and Word files aloud with the browser's voices, highlighting the words being read.

## Permission justification: activeTab

The extension starts only when the person clicks it, uses the shortcut or the right-click menu, and then reads the tab they are on.

## Permission justification: scripting

Injects the reader (text finder, highlighter and player) into the current tab when the person starts reading.

## Permission justification: storage

Saves the chosen voice, speed and setups.

## Permission justification: contextMenus

Adds 'Read this aloud' and 'Read this PDF / Word file aloud' to the right-click menu.

## Permission justification: externally_connectable (https://mes.fm/*)

Lets the mes.fm PDF Editor, Word Viewer or Text Viewer tab that the extension opens ask it for the file the person chose, so the file is shown there without being uploaded anywhere. Only mes.fm pages can ask, only with the one-time code the extension put in that tab's address.

## Permission justification: Host permission file:///*

Lets the person open a PDF or Word file from their own computer in the reader (Chrome also asks them to allow file URLs).

## Permission justification: Optional host permissions (docs.google.com, *.googleusercontent.com, *://*/*)

Asked only when needed: Google Docs draws text on a canvas, so the extension downloads the document's plain-text export with the person's own sign-in; *://*/* only to open a PDF / Word link whose site does not allow it otherwise.

## Are you using remote code?

No, I am not using Remote code. (All code, including libraries, is inside the package.)

## Data usage

None. Tick nothing under data collection, then tick the three certifications (not sold, not used for unrelated purposes, not used for credit).

## Privacy policy URL

https://mes.fm/privacy-policy#browser-extensions

## Distribution

Public; all regions; free
