Real job feed responses, trimmed to a few jobs, saved on 2026-11-27. Parser tests in
tests/unit/jobfeeds.test.ts read these so the parsers match each job board's actual format.

One exception: in oracle-digitalrealty.json, the 9132 and 9107 entries use the titles, ids and
locations of real Bay Area jobs in that feed, but their PostedDate values are made up for the test.

The part-2 samples (amazon, eightfold, smartrecruiters, neogov, jobvite) keep each job's real fields
but drop long text and unused fields. eightfold-microsoft.json's second and third positions, the
neogov "Librarian I" item and the jobvite "Senior Estimator II" entry are built from jobs listed in the
same research (title, link and location are real; ids and dates are made up for the test).
