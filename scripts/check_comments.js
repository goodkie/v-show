const { execFileSync } = require('child_process');

function getIssueComments() {
  const issueRaw = execFileSync('gh', ['api', 'repos/goodkie/v-show/issues/6'], { encoding: 'utf8' });
  const issue = JSON.parse(issueRaw);
  console.log('Total comments:', issue.comments);
  const lastPage = Math.ceil(issue.comments / 100);
  const commentsRaw = execFileSync('gh', ['api', `repos/goodkie/v-show/issues/6/comments?per_page=100&page=${lastPage}`], { encoding: 'utf8' });
  const comments = JSON.parse(commentsRaw);
  const last5 = comments.slice(-5);
  console.log(JSON.stringify(last5.map(c => ({
    id: c.id,
    user: c.user.login,
    created_at: c.created_at,
    title: c.body.split('\n')[0],
    body_head: c.body.split('\n').slice(0, 10).join('\n')
  })), null, 2));
}

getIssueComments();
