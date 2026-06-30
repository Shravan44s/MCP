// ============================================
// GitHub API Client Wrapper (via Octokit)
// ============================================
import { Octokit } from "@octokit/rest";

export class GitHubClient {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  /**
   * Create a new issue on a repository
   */
  async createIssue(params: {
    owner: string;
    repo: string;
    title: string;
    body?: string;
    labels?: string[];
  }) {
    const response = await this.octokit.rest.issues.create({
      owner: params.owner,
      repo: params.repo,
      title: params.title,
      body: params.body,
      labels: params.labels,
    });
    return {
      number: response.data.number,
      url: response.data.html_url,
      title: response.data.title,
      state: response.data.state,
    };
  }

  /**
   * List issues for a repository
   */
  async listIssues(params: {
    owner: string;
    repo: string;
    state?: "open" | "closed" | "all";
    limit?: number;
  }) {
    const response = await this.octokit.rest.issues.listForRepo({
      owner: params.owner,
      repo: params.repo,
      state: params.state || "open",
      per_page: params.limit || 30,
    });
    return response.data.map((issue) => ({
      number: issue.number,
      title: issue.title,
      state: issue.state,
      url: issue.html_url,
      labels: issue.labels.map((l) =>
        typeof l === "string" ? l : l.name || ""
      ),
      created_at: issue.created_at,
    }));
  }

  /**
   * Create a pull request
   */
  async createPullRequest(params: {
    owner: string;
    repo: string;
    title: string;
    head: string;
    base: string;
    body?: string;
  }) {
    const response = await this.octokit.rest.pulls.create({
      owner: params.owner,
      repo: params.repo,
      title: params.title,
      head: params.head,
      base: params.base,
      body: params.body,
    });
    return {
      number: response.data.number,
      url: response.data.html_url,
      title: response.data.title,
      state: response.data.state,
    };
  }

  /**
   * Create or update a file and commit it
   */
  async commitFile(params: {
    owner: string;
    repo: string;
    path: string;
    content: string;
    message: string;
    branch?: string;
  }) {
    // Check if file exists to get its SHA (needed for updates)
    let sha: string | undefined;
    try {
      const existing = await this.octokit.rest.repos.getContent({
        owner: params.owner,
        repo: params.repo,
        path: params.path,
        ref: params.branch,
      });
      if (!Array.isArray(existing.data) && existing.data.type === "file") {
        sha = existing.data.sha;
      }
    } catch {
      // File doesn't exist yet — that's fine, we'll create it
    }

    const response = await this.octokit.rest.repos.createOrUpdateFileContents({
      owner: params.owner,
      repo: params.repo,
      path: params.path,
      message: params.message,
      content: Buffer.from(params.content).toString("base64"),
      branch: params.branch,
      sha,
    });

    return {
      commit_sha: response.data.commit.sha,
      commit_url: response.data.commit.html_url,
      file_path: params.path,
    };
  }

  /**
   * List repositories for the authenticated user
   */
  async listRepos(params?: { type?: "all" | "owner" | "member"; sort?: "created" | "updated" | "pushed" | "full_name" }) {
    const response = await this.octokit.rest.repos.listForAuthenticatedUser({
      type: params?.type || "owner",
      sort: params?.sort || "updated",
      per_page: 30,
    });
    return response.data.map((repo) => ({
      full_name: repo.full_name,
      description: repo.description,
      url: repo.html_url,
      language: repo.language,
      stars: repo.stargazers_count,
      private: repo.private,
      updated_at: repo.updated_at,
    }));
  }

  /**
   * Get details of a specific repository
   */
  async getRepo(params: { owner: string; repo: string }) {
    const response = await this.octokit.rest.repos.get({
      owner: params.owner,
      repo: params.repo,
    });
    const r = response.data;
    return {
      full_name: r.full_name,
      description: r.description,
      url: r.html_url,
      language: r.language,
      stars: r.stargazers_count,
      forks: r.forks_count,
      open_issues: r.open_issues_count,
      default_branch: r.default_branch,
      private: r.private,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  }

  /**
   * Create a new repository for the authenticated user or an organization
   */
  async createRepo(params: {
    name: string;
    description?: string;
    private?: boolean;
    org?: string;
  }) {
    if (params.org) {
      const response = await this.octokit.rest.repos.createInOrg({
        org: params.org,
        name: params.name,
        description: params.description,
        private: params.private,
      });
      return {
        name: response.data.name,
        full_name: response.data.full_name,
        url: response.data.html_url,
      };
    } else {
      const response = await this.octokit.rest.repos.createForAuthenticatedUser({
        name: params.name,
        description: params.description,
        private: params.private,
      });
      return {
        name: response.data.name,
        full_name: response.data.full_name,
        url: response.data.html_url,
      };
    }
  }
}
