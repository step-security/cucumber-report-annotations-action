# 🧪 Cucumber Report Annotations Action

This GitHub Action parses Cucumber test reports (JSON or NDJSON) and publishes them as GitHub Annotations—making test feedback visible directly in pull requests and commits.

---

## 🚀 Usage

```yaml
- uses: step-security/cucumber-report-annotations-action@v1
  with:
    access-token: ${{ secrets.GITHUB_TOKEN }}
    path: "**/cucumber-report.json"
```

---

## 📂 Supported Report Formats

This action supports two types of Cucumber report formats:

| Format     | Description                                                                 |
|------------|-----------------------------------------------------------------------------|
| **JSON**   | Legacy Cucumber format. File extension must be `.json`.                    |
| **NDJSON** | Newline-delimited JSON (aka Cucumber Message Format). File must end with `.ndjson`. Recommended format. |

---

## ⚙️ Inputs

All inputs are optional and can be customized to control behavior.

| Input Name                         | Description                                                                                     | Default                     | Options                           |
|-----------------------------------|-------------------------------------------------------------------------------------------------|-----------------------------|-----------------------------------|
| `access-token`                    | GitHub token used to create the check.                                                          | `${{ github.token }}`       | –                                 |
| `path`                            | Glob pattern to find Cucumber report files.                                                     | `**/cucumber-report.json`   | –                                 |
| `name`                            | Name of the GitHub Check.                                                                       | `Cucumber report`           | –                                 |
| `check-status-on-error`           | Status of the check if errors are found.                                                        | `failure`                   | `success`, `neutral`, `failure`   |
| `check-status-on-undefined`       | Status of the check if undefined steps are found.                                               | `success`                   | `success`, `neutral`, `failure`   |
| `check-status-on-pending`         | Status of the check if pending steps are found.                                                 | `success`                   | `success`, `neutral`, `failure`   |
| `annotation-status-on-error`      | Annotation level for failed steps.                                                              | `failure`                   | `notice`, `warning`, `failure`    |
| `annotation-status-on-undefined`  | Annotation level for undefined steps. No annotation is generated if not set.                    | *(unset)*                   | `notice`, `warning`, `failure`    |
| `annotation-status-on-pending`    | Annotation level for pending steps. No annotation is generated if not set.                      | *(unset)*                   | `notice`, `warning`, `failure`    |
| `show-number-of-error-on-check-title` | If `true`, shows the number of errors in the GitHub Check title.                             | `true`                      | `true`, `false`                   |
| `show-global-summary-report`      | If `true`, adds a feature-by-feature summary for all scenarios.                                 | `false`                     | `true`, `false`                   |
| `number-of-test-error-to-fail-job`| Number of test errors that will fail the job. Set to `-1` to never fail the job based on tests. | `-1`                        | –                                 |

---

## 📤 Outputs

Each processed report file will expose the following outputs, using the filename (without extension, spaces replaced with underscores) as a prefix:

| Output Key                             | Description                     |
|----------------------------------------|---------------------------------|
| `${output}_failed_scenarios`           | Number of failed scenarios      |
| `${output}_undefined_scenarios`        | Number of undefined scenarios   |
| `${output}_pending_scenarios`          | Number of pending scenarios     |
| `${output}_passed_scenarios`           | Number of passed scenarios      |
| `${output}_failed_steps`               | Number of failed steps          |
| `${output}_undefined_steps`            | Number of undefined steps       |
| `${output}_pending_steps`              | Number of pending steps         |
| `${output}_passed_steps`               | Number of passed steps          |

---

## ✅ Features

- 🔍 Highlights failed, undefined, and pending steps inline in the PR.
- 📄 Summarizes scenario/test outcomes per feature.
- ⚠️ Supports annotations with customizable severity levels.
- 📊 Produces GitHub Action outputs for use in downstream steps.

---

## 📎 Notes

- Only the first 50 annotations are shown per check due to GitHub limitations.
- NDJSON is the recommended format going forward as it supports richer metadata.
