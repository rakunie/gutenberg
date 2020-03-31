/**
 * Internal dependencies
 */
const debug = require( './debug' );
const getAssociatedPullRequest = require( './get-associated-pull-request' );
const hasWordPressProfile = require( './has-wordpress-profile' );

/** @typedef {import('@actions/github').GitHub} GitHub */
/** @typedef {import('@octokit/webhooks').WebhookPayloadPush} WebhookPayloadPush */
/** @typedef {import('./get-associated-pull-request').WebhookPayloadPushCommit} WebhookPayloadPushCommit */

/**
 * Message of comment prompting contributor to link their GitHub account from
 * their WordPress.org profile for props credit.
 *
 * @type {string}
 */
const ACCOUNT_LINK_PROMPT =
	"Congratulations on your first merged pull request! We'd like to credit " +
	'you for your contribution in the post announcing the next WordPress ' +
	"release, but we can't find a WordPress.org profile associated with your " +
	'GitHub account. When you have a moment, visit the following URL and ' +
	'click "link your GitHub account" under "GitHub Username" to link your ' +
	'accounts:\n\nhttps://profiles.wordpress.org/me/profile/edit/\n\nAnd if ' +
	"you don't have a WordPress.org account, you can create one on this page:" +
	'\n\nhttps://login.wordpress.org/register\n\nKudos!';

/**
 * Adds the 'First Time Contributor' label to PRs merged on behalf of
 * contributors that have not yet made a commit.
 *
 * @param {WebhookPayloadPush} payload Push event payload.
 * @param {GitHub}             octokit Initialized Octokit REST client.
 */
async function addFirstTimeContributorLabel( payload, octokit ) {
	if ( payload.ref !== 'refs/heads/master' ) {
		debug(
			'add-first-time-contributor-label: Commit is not to `master`. Aborting'
		);
		return;
	}

	const commit =
		/** @type {WebhookPayloadPushCommit} */ ( payload.commits[ 0 ] );
	const pullRequest = getAssociatedPullRequest( commit );
	if ( ! pullRequest ) {
		debug(
			'add-first-time-contributor-label: Cannot determine pull request associated with commit. Aborting'
		);
		return;
	}

	const repo = payload.repository.name;
	const owner = payload.repository.owner.login;
	const author = commit.author.username;
	debug(
		`add-first-time-contributor-label: Searching for commits in ${ owner }/${ repo } by @${ author }`
	);

	const { data: commits } = await octokit.repos.listCommits( {
		owner,
		repo,
		author,
	} );

	if ( commits.length > 1 ) {
		debug(
			`add-first-time-contributor-label: Not the first commit for author. Aborting`
		);
		return;
	}

	debug(
		`add-first-time-contributor-label: Adding 'First Time Contributor' label to issue #${ pullRequest }`
	);

	await octokit.issues.addLabels( {
		owner,
		repo,
		issue_number: pullRequest,
		labels: [ 'First-time Contributor' ],
	} );

	debug(
		`add-first-time-contributor-label: Checking for WordPress username associated with @${ author }`
	);

	let hasProfile;
	try {
		hasProfile = await hasWordPressProfile( author );
	} catch ( error ) {
		debug(
			`add-first-time-contributor-label: Error retrieving from profile API:\n\n${ error.toString() }`
		);
		return;
	}

	if ( hasProfile ) {
		debug(
			`add-first-time-contributor-label: User already known. No need to prompt for account link!`
		);
		return;
	}

	await octokit.issues.createComment( {
		owner,
		repo,
		issue_number: pullRequest,
		body: ACCOUNT_LINK_PROMPT,
	} );
}

module.exports = addFirstTimeContributorLabel;
