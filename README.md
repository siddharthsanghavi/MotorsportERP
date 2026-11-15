# MotorsportERP
ERP workspace for an FSAE Formula car team.

## Web app MVP

Open `index.html` in a browser (or serve the folder with any static file server). The app uses browser `localStorage`, so it needs no backend setup.

### Modules

- Projects: propose a project (subteam, cost, target date, people), get it approved by the subteam lead or leadership, then track it through Approved → In Progress → Review → Complete. Several people can be assigned; the subteam lead picks one as POC. Each project has assigned tasks with due dates and a progress bar, and open tasks show up in each person's queue.
- Parts and inventory: add, search, advance lifecycle, and delete tracked parts
- BOM import/export: load a CSV (file or pasted from a spreadsheet) from SolidWorks, Onshape, Fusion, etc. Columns are matched by name and can be remapped in a preview; an indented BOM with a Level column builds the parts tree; existing part numbers can be updated in place. Export the current BOM as CSV.
- Documents: register drawings, analyses, test reports, rules paperwork and more with auto-numbering (DOC-0001), links to the file, part/project links, and Draft → In Review → Released control with revision history. Authors can't release their own documents.
- Competition deliverables: checklist (SES, IAD, ESF, FMEA, cost report, design report…) linked to documents, with due dates and overdue warnings.
- Purchasing and vendors: purchase requests linked to a budget, part and project. Quotes over $500 need the President, VP or Chief Mechanic. Use "Order" on a part to pre-fill a request.
- Machine shop: jobs with a machinist, machine, hours, part and project. A job can't start until the machinist is signed off on that machine.
- Budget tracker: category allocations. Spend includes linked purchases that are ordered or received, and shows money approved but not yet ordered.
- Cost report (Budget tab): FSAE cost-event roll-up from the BOM by system (material, process incl. shop hours × shop rate, fasteners, tooling) for the EV or ICE car, with CSV export. Treat it as a starting point and check it against the season's cost rules.
- Testing: log track sessions (car, event, driver, laps, km, setup notes, data-log link). Km are added to every installed part on that car, and issues become tasks on a project.
- Part life & inspections (Parts tab): life limits and inspection intervals in km, safety-critical flags, inspection and replacement logging, and a failure log. Overdue items go to the right people's queue.
- Stock & tools: tools, consumables, spares and safety gear with check-out/check-in (blocked without the required training), consumable use, low-stock reorder that creates a purchase request and restocks on receipt, overdue returns, and printable QR labels with a scan box for USB scanners.
- Training sign-offs (Team tab): a member × training matrix that Shop Leads and the Chief Mechanic tick off.
- Season timeline (Projects tab): projects as bars from approval to target date, against editable milestones (design freeze, competitions…).
- Notifications: an in-app bell for approvals, assignments, releases, failures and due-soon tasks.
- Edit any part, purchase, job, project or stock item in a dialog (who can edit follows the roles). Deletes ask for confirmation.
- Backup / Restore: download the whole workspace as JSON and restore it (Admin only). Data lives in this browser, so back up regularly.
- Design approvals: submit revisions for review and advance approval status
- Assembly: parts tree (list or React Flow graph) of what mounts on what, plus an EV vs ICE shared-parts Venn diagram
- Team map: React Flow org chart with President, Vice President, and Chief Mechanic at the top, 12 subteams (Low Voltage, EV Powertrain, Vehicle Dynamics, Suspension, Driver Interface, Frame, Driveline, Combustion, Aerodynamics, Composites, Manufacturing, Business) grouped under their leader, a lead per subteam, and members who can sit on several subteams. Demo roster names are generated and fictional.
- Team & roles: members hold roles (Admin, Purchasing Approver, Design Review Approver, Subteam Lead, Budget Manager, Shop Lead); switch "Acting as" in the header to see each person's permissions. Approvers can't sign off their own requests. Roles are enforced in the page only, not as real security.
- Demo controls: load realistic records across every module or clear the local workspace
- Overview dashboard with counts, a "waiting on you" queue, and an audit log of who did what

The React Flow graph loads React and React Flow from unpkg, so it needs an internet connection; QR labels use qrcode-generator from cdnjs. Everything else works offline.
