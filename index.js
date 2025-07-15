const core = require('@actions/core');
const github = require('@actions/github');
const glob = require("@actions/glob");
const fs = require("fs");
const reportReaderJson = require('./reportReader-json');
const reportReaderNdJson = require('./reportReader-ndjson');
const path = require('path');
const axios = require('axios');

async function validateSubscription() {
  const API_URL = `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/subscription`;

  try {
    await axios.get(API_URL, {timeout: 3000});
  } catch (error) {
    if (error.response) {
      console.error(
        'Subscription is not valid. Reach out to support@stepsecurity.io'
      );
      process.exit(1);
    } else {
      core.info('Timeout or API not reachable. Continuing to next step.');
    }
  }
}

function createMemoizedFunction(fn) {
    const cache = new Map();
    return (...args) => {
        const key = JSON.stringify(args);
        if (cache.has(key)) {
            return cache.get(key);
        }
        const result = fn(...args);
        cache.set(key, result);
        return result;
    };
}

async function findBestFileMatch(file) {
    let searchFile = file;
    if (searchFile.startsWith('classpath:')) {
        searchFile = searchFile.substring(10);
    }
    
    const globber = await glob.create('**/' + searchFile, {
        followSymbolicLinks: false,
    });
    
    const files = await globber.glob();
    if (files.length === 0) {
        core.debug(`No file found for ${file}.`);
        return undefined;
    }
    
    const featureFile = files[0];
    const repoName = github.context.repo.repo;
    const indexOfRepoName = featureFile.indexOf(repoName);
    
    if (indexOfRepoName === -1) {
        core.debug(`Best path found for ${file} is ${featureFile}.`);
        return featureFile;
    }
    
    const filePathWithoutWorkspace = featureFile.substring(indexOfRepoName + repoName.length * 2 + 2);
    core.debug(`Best path found for ${file} is ${filePathWithoutWorkspace}.`);
    return filePathWithoutWorkspace;
}

const memoizedFindBestFileMatch = createMemoizedFunction(findBestFileMatch);

async function createStepAnnotation(cucumberError, status, errorType) {
    const filePath = await memoizedFindBestFileMatch(cucumberError.file);
    
    return {
        path: filePath || cucumberError.file,
        start_line: cucumberError.line || 0,
        end_line: cucumberError.line || 0,
        start_column: 0,
        end_column: 0,
        annotation_level: status,
        title: `${cucumberError.title} ${errorType}`,
        message: `Scenario: ${cucumberError.title}\nStep: ${cucumberError.step}\nError: \n${cucumberError.error || ''}`
    };
}

async function createReportDetailAnnotation(fileReport) {
    const message = fileReport.scenarios
        .map(scenario => `${getStatusEmoji(scenario.status)} Scenario: ${scenario.name}`)
        .join('\n');

    const filePath = await memoizedFindBestFileMatch(fileReport.file);

    return {
        path: filePath || fileReport.file,
        start_line: 0,
        end_line: 0,
        start_column: 0,
        end_column: 0,
        annotation_level: 'notice',
        title: `Feature: ${fileReport.name} Report`,
        message
    };
}

function getStatusEmoji(status) {
    const statusMap = {
        'success': '✅',
        'failed': '❌',
        'pending': '⌛',
        'undefined': '❓',
        'skipped': '⏭️'
    };
    return statusMap[status] || '-';
}

function buildSummaryText(itemNumber, itemType, itemCounts) {
    const header = `${itemNumber} ${itemType}`;
    const counts = Object.keys(itemCounts)
        .filter(key => itemCounts[key] > 0)
        .map(key => `${itemCounts[key]} ${key}`)
        .join(', ');
    return `    ${header} (${counts})`;
}

function setActionOutputs(outputName, summaryScenario, summarySteps) {
    for (const [type, count] of Object.entries(summaryScenario)) {
        const outputKey = `${outputName}_${type}_scenarios`;
        core.debug(`Setting output ${outputKey}=${count}`);
        core.setOutput(outputKey, count);
    }
    
    for (const [type, count] of Object.entries(summarySteps)) {
        const outputKey = `${outputName}_${type}_steps`;
        core.debug(`Setting output ${outputKey}=${count}`);
        core.setOutput(outputKey, count);
    }
}

function determineCheckStatus(globalInfo, checkStatusOnError, checkStatusOnUndefined, checkStatusOnPending) {
    if (globalInfo.failedScenarioNumber > 0 && checkStatusOnError !== 'success') {
        return checkStatusOnError;
    }
    if (globalInfo.undefinedStepsNumber > 0 && checkStatusOnUndefined !== 'success') {
        return checkStatusOnUndefined;
    }
    if (globalInfo.pendingStepNumber > 0 && checkStatusOnPending !== 'success') {
        return checkStatusOnPending;
    }
    return 'success';
}

async function processAnnotations(reportResult, annotationStatusOnError, annotationStatusOnUndefined, annotationStatusOnPending) {
    const annotations = [];
    
    const errorAnnotations = await Promise.all(
        reportResult.failedSteps.map(error => 
            createStepAnnotation(error, annotationStatusOnError, 'Failed')
        )
    );
    annotations.push(...errorAnnotations);
    
    if (annotationStatusOnUndefined) {
        const undefinedAnnotations = await Promise.all(
            reportResult.undefinedSteps.map(error => 
                createStepAnnotation(error, annotationStatusOnUndefined, 'Undefined')
            )
        );
        annotations.push(...undefinedAnnotations);
    }
    
    if (annotationStatusOnPending) {
        const pendingAnnotations = await Promise.all(
            reportResult.pendingSteps.map(error => 
                createStepAnnotation(error, annotationStatusOnPending, 'Pending')
            )
        );
        annotations.push(...pendingAnnotations);
    }
    
    return annotations.slice(0, 49);
}

async function createGlobalSummaryAnnotations(reportResult) {
    return await Promise.all(
        reportResult.listAllScenarioByFile.map(fileReport => 
            createReportDetailAnnotation(fileReport)
        )
    );
}

async function main() {
    try {
        await validateSubscription();
        const inputPath = core.getInput('path');
        const checkName = core.getInput('name');
        const accessToken = core.getInput('access-token');
        const checkStatusOnError = core.getInput('check-status-on-error');
        const checkStatusOnUndefined = core.getInput('check-status-on-undefined');
        const checkStatusOnPending = core.getInput('check-status-on-pending');
        const annotationStatusOnError = core.getInput('annotation-status-on-error');
        const annotationStatusOnUndefined = core.getInput('annotation-status-on-undefined');
        const annotationStatusOnPending = core.getInput('annotation-status-on-pending');
        const showNumberOfErrorOnCheckTitle = core.getInput('show-number-of-error-on-check-title');
        const numberOfTestErrorToFailJob = parseInt(core.getInput('number-of-test-error-to-fail-job'));
        const showGlobalSummaryReport = core.getInput('show-global-summary-report');

        const globber = await glob.create(inputPath, {
            followSymbolicLinks: false,
        });

        core.info(`Starting to read cucumber logs using path: ${inputPath}`);

        for await (const cucumberReportFile of globber.globGenerator()) {
            core.info(`Processing cucumber report: ${cucumberReportFile}`);

            const reportOutputName = path.basename(cucumberReportFile)
                .replace(/\s+/g, '_')
                .replace(/\.json$/, '');

            const reportContent = await fs.promises.readFile(cucumberReportFile, 'utf8');
            const reportResult = cucumberReportFile.endsWith('.json')
                ? reportReaderJson.reader(reportContent)
                : reportReaderNdJson.reader(reportContent);

            const globalInfo = reportResult.globalInformation;
            
            const summaryScenario = {
                'failed': globalInfo.failedScenarioNumber,
                'undefined': globalInfo.undefinedScenarioNumber,
                'pending': globalInfo.pendingScenarioNumber,
                'passed': globalInfo.succeedScenarioNumber
            };

            const summarySteps = {
                'failed': globalInfo.failedStepsNumber,
                'undefined': globalInfo.undefinedStepsNumber,
                'skipped': globalInfo.skippedStepsNumber,
                'pending': globalInfo.pendingStepNumber,
                'passed': globalInfo.succeedStepsNumber
            };

            setActionOutputs(reportOutputName, summaryScenario, summarySteps);

            const summary = buildSummaryText(globalInfo.scenarioNumber, 'Scenarios', summaryScenario) +
                          '\n' +
                          buildSummaryText(globalInfo.stepsNumber, 'Steps', summarySteps);

            const annotations = await processAnnotations(
                reportResult,
                annotationStatusOnError,
                annotationStatusOnUndefined,
                annotationStatusOnPending
            );

            const pullRequest = github.context.payload.pull_request;
            const headSha = (pullRequest && pullRequest.head.sha) || github.context.sha;

            let titleSuffix = '';
            if (showNumberOfErrorOnCheckTitle === 'true' && globalInfo.failedScenarioNumber > 0) {
                const errorCount = globalInfo.failedScenarioNumber;
                titleSuffix = ` (${errorCount} error${errorCount > 1 ? 's' : ''})`;
            }

            const checkStatus = determineCheckStatus(
                globalInfo,
                checkStatusOnError,
                checkStatusOnUndefined,
                checkStatusOnPending
            );

            const createCheckRequest = {
                ...github.context.repo,
                name: checkName,
                head_sha: headSha,
                status: 'completed',
                conclusion: checkStatus,
                output: {
                    title: checkName + titleSuffix,
                    summary,
                    annotations
                }
            };

            core.info(`Creating summary:\n${summary}`);
            
            await core.summary
                .addHeading(checkName + titleSuffix, 4)
                .addRaw("\n" + summary)
                .write();

            core.info('Sending cucumber annotations to GitHub');
            const octokit = github.getOctokit(accessToken);
            const checkResponse = await octokit.rest.checks.create(createCheckRequest);

            if (numberOfTestErrorToFailJob !== -1 && annotations.length >= numberOfTestErrorToFailJob) {
                core.setFailed(`${annotations.length} test(s) failed`);
            }

            if (showGlobalSummaryReport === 'true') {
                core.info('Building global scenario summary');
                const globalSummaryAnnotations = await createGlobalSummaryAnnotations(reportResult);
                
                core.info('Sending global scenario summary');
                await octokit.rest.checks.update({
                    ...github.context.repo,
                    check_run_id: checkResponse.data.id,
                    output: {
                        title: checkName + titleSuffix,
                        summary,
                        annotations: globalSummaryAnnotations
                    }
                });
            }
        }
    } catch (error) {
        core.setFailed(`Action failed: ${error.message}`);
    }
}

main();