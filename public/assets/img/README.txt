Brand logo
==========

Save your exact logo image in THIS folder with the filename:

    amber-logo.png

(a square PNG with a transparent or matching background works best;
 SVG also fine if you name the <img> src accordingly)

The app automatically uses this file for the logo in the sidebar and on the
login/sign-up screens. If the file is absent, a built-in SVG dot-ring
fallback is shown instead, so the UI never breaks.

To use a different filename or format, update the src in:
    public/assets/js/app.js   -> const LOGO_MARK = ... src="assets/img/amber-logo.png"
