const EMPTY_GLOBAL_INFO = {
    scenarioNumber: 0,
    failedScenarioNumber: 0,
    pendingScenarioNumber: 0,
    undefinedScenarioNumber: 0,
    stepsNumber: 0,
    succeedScenarioNumber: 0,
    failedStepsNumber: 0,
    skippedStepsNumber: 0,
    undefinedStepsNumber: 0,
    succeedStepsNumber: 0,
    pendingStepNumber: 0
};

function getStepsByStatus(scenario, status) {
    const beforeSteps = scenario.before || [];
    const afterSteps = scenario.after || [];
    const steps = scenario.steps || [];
    
    return [...beforeSteps, ...afterSteps, ...steps]
        .filter(step => step.result && step.result.status === status);
}

function getScenarioStatus(scenario) {
    const allSteps = [...(scenario.before || []), ...(scenario.after || []), ...(scenario.steps || [])];
    
    for (const step of allSteps) {
        if (step.result) {
            switch (step.result.status) {
                case 'failed':
                    return 'failed';
                case 'undefined':
                    return 'undefined';
                case 'pending':
                    return 'pending';
                case 'skipped':
                    return 'skipped';
            }
        }
    }
    return 'success';
}

function hasStepWithStatus(scenario, status) {
    return getStepsByStatus(scenario, status).length > 0;
}

function buildStepData(fileReport, scenario, getStepsFunction) {
    const failedSteps = getStepsFunction(scenario);
    if (failedSteps.length === 0) {
        return null;
    }
    
    const firstFailedStep = failedSteps[0];
    return {
        file: fileReport.uri,
        line: firstFailedStep.line,
        title: scenario.name,
        step: firstFailedStep.name,
        error: firstFailedStep.result.error_message || ''
    };
}

function extractFailedStepsData(fileReport) {
    return fileReport.elements
        .filter(scenario => scenario.type === 'scenario' && hasStepWithStatus(scenario, 'failed'))
        .map(scenario => buildStepData(fileReport, scenario, s => getStepsByStatus(s, 'failed')))
        .filter(data => data !== null);
}

function extractUndefinedStepsData(fileReport) {
    return fileReport.elements
        .filter(scenario => scenario.type === 'scenario' && hasStepWithStatus(scenario, 'undefined'))
        .map(scenario => buildStepData(fileReport, scenario, s => getStepsByStatus(s, 'undefined')))
        .filter(data => data !== null);
}

function extractPendingStepsData(fileReport) {
    return fileReport.elements
        .filter(scenario => scenario.type === 'scenario' && hasStepWithStatus(scenario, 'pending'))
        .map(scenario => buildStepData(fileReport, scenario, s => getStepsByStatus(s, 'pending')))
        .filter(data => data !== null);
}

function extractFileScenarios(fileReport) {
    return {
        file: fileReport.uri,
        name: fileReport.name,
        scenarios: fileReport.elements
            .filter(element => element.type === 'scenario')
            .map(scenario => ({
                name: scenario.name,
                status: getScenarioStatus(scenario)
            }))
    };
}

function calculateGlobalInformation(reportFile) {
    const scenarios = reportFile.elements.filter(element => element.type === 'scenario');
    
    const failedScenarios = scenarios.filter(scenario => hasStepWithStatus(scenario, 'failed'));
    const undefinedScenarios = scenarios.filter(scenario => hasStepWithStatus(scenario, 'undefined'));
    const pendingScenarios = scenarios.filter(scenario => hasStepWithStatus(scenario, 'pending'));
    
    const totalSteps = scenarios.reduce((sum, scenario) => 
        sum + (scenario.steps ? scenario.steps.length : 0), 0);
    
    const failedSteps = scenarios.reduce((sum, scenario) => 
        sum + getStepsByStatus(scenario, 'failed').length, 0);
    
    const skippedSteps = scenarios.reduce((sum, scenario) => 
        sum + getStepsByStatus(scenario, 'skipped').length, 0);
    
    const undefinedSteps = scenarios.reduce((sum, scenario) => 
        sum + getStepsByStatus(scenario, 'undefined').length, 0);
    
    const pendingSteps = scenarios.reduce((sum, scenario) => 
        sum + getStepsByStatus(scenario, 'pending').length, 0);
    
    const passedSteps = totalSteps - failedSteps - skippedSteps - undefinedSteps - pendingSteps;
    const passedScenarios = scenarios.length - failedScenarios.length - undefinedScenarios.length - pendingScenarios.length;
    
    return {
        scenarioNumber: scenarios.length,
        failedScenarioNumber: failedScenarios.length,
        undefinedScenarioNumber: undefinedScenarios.length,
        pendingScenarioNumber: pendingScenarios.length,
        succeedScenarioNumber: Math.max(0, passedScenarios),
        stepsNumber: totalSteps,
        failedStepsNumber: failedSteps,
        skippedStepsNumber: skippedSteps,
        undefinedStepsNumber: undefinedSteps,
        pendingStepNumber: pendingSteps,
        succeedStepsNumber: Math.max(0, passedSteps)
    };
}

function combineGlobalInfo(info1, info2) {
    return {
        scenarioNumber: info1.scenarioNumber + info2.scenarioNumber,
        failedScenarioNumber: info1.failedScenarioNumber + info2.failedScenarioNumber,
        pendingScenarioNumber: info1.pendingScenarioNumber + info2.pendingScenarioNumber,
        undefinedScenarioNumber: info1.undefinedScenarioNumber + info2.undefinedScenarioNumber,
        stepsNumber: info1.stepsNumber + info2.stepsNumber,
        succeedScenarioNumber: info1.succeedScenarioNumber + info2.succeedScenarioNumber,
        failedStepsNumber: info1.failedStepsNumber + info2.failedStepsNumber,
        skippedStepsNumber: info1.skippedStepsNumber + info2.skippedStepsNumber,
        undefinedStepsNumber: info1.undefinedStepsNumber + info2.undefinedStepsNumber,
        succeedStepsNumber: info1.succeedStepsNumber + info2.succeedStepsNumber,
        pendingStepNumber: info1.pendingStepNumber + info2.pendingStepNumber
    };
}

function reader(reportString) {
    const report = JSON.parse(reportString);
    
    return {
        get listAllScenarioByFile() {
            return report.map(fileReport => extractFileScenarios(fileReport));
        },
        
        get globalInformation() {
            return report
                .map(fileReport => calculateGlobalInformation(fileReport))
                .reduce((acc, info) => combineGlobalInfo(acc, info), { ...EMPTY_GLOBAL_INFO });
        },
        
        get failedSteps() {
            return report
                .map(fileReport => extractFailedStepsData(fileReport))
                .flat();
        },
        
        get undefinedSteps() {
            return report
                .map(fileReport => extractUndefinedStepsData(fileReport))
                .flat();
        },
        
        get pendingSteps() {
            return report
                .map(fileReport => extractPendingStepsData(fileReport))
                .flat();
        }
    };
}

module.exports = { reader };