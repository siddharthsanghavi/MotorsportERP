# MotorsportERP
ERP workspace for an FSAE Formula car team.

## Web app MVP

Open `index.html` in a browser (or serve the folder with any static file server). The app uses browser `localStorage`, so it needs no backend setup.

### Modules

- Parts and inventory: add, search, advance lifecycle, and delete tracked parts
- Purchasing and vendors: create purchase requests with vendor, amount, due date, and status
- Machine shop: queue jobs with owner, material, due date, priority, and status
- Budget tracker: record category allocations and see spend remaining/progress
- Design approvals: submit revisions for review and advance approval status
- Assembly: parts tree (list or React Flow graph) of what mounts on what, plus an EV vs ICE shared-parts Venn diagram
- Team map: React Flow org chart with President, Vice President, and Chief Mechanic at the top, 12 subteams (Low Voltage, EV Powertrain, Vehicle Dynamics, Suspension, Driver Interface, Frame, Driveline, Combustion, Aerodynamics, Composites, Manufacturing, Business) grouped under their leader, a lead per subteam, and members who can sit on several subteams. Demo roster names are generated and fictional.
- Team & roles: members hold roles (Admin, Purchasing Approver, Design Review Approver, Subteam Lead, Budget Manager, Shop Lead); switch "Acting as" in the header to see each person's permissions. Approvers can't sign off their own requests. Roles are enforced in the page only, not as real security.
- Overview dashboard with counts, a "waiting on you" queue, and an audit log of who did what

The React Flow graph loads React and React Flow from unpkg, so it needs an internet connection; everything else works offline.
- Demo controls: load realistic records across every module or clear the local workspace
