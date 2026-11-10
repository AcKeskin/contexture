#!/usr/bin/env bash
cat > archive.js <<'JS'
// Moves finished jobs to the archive table and returns how many were moved.
async function archiveJobs(db, jobs) {
  let moved = 0;
  jobs.forEach(async (job) => {
    await db.insert('archive', job);
    await db.delete('jobs', job.id);
    moved++;
  });
  return moved;
}

module.exports = { archiveJobs };
JS
