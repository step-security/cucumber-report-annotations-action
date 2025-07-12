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

function getTestCaseStatus(testCase) {
    if (!testCase || !testCase.steps) {
        return 'success';
    }
    
    for (const step of testCase.steps) {
        if (step.result) {
            switch (step.result?.status) {
                case 'FAILED':
                    return 'failed';
                case 'UNDEFINED':
                    return 'undefined';
                case 'PENDING':
                    return 'pending';
                case 'SKIPPED':
                    return 'skipped';
            }
        }
    }
    return 'success';
}

function getStepsByStatus(testSteps, status) {
    return Object.values(testSteps)
        .filter(step => step.result && step.result.status === status)
        .map(step => ({
            file: step.pickleStep.pickle.scenario.uri,
            line: step.pickleStep.location.line,
            title: step.pickleStep.pickle.name,
            step: step.pickleStep.name,
            error: step.result.message || ''
        }));
}

function reader(reportString) {
    const features = [];
    const scenarios = {};
    const steps = {};
    const pickles = {};
    const pickleSteps = {};
    const testCases = {};
    const testSteps = {};
    const globalInfo = { ...EMPTY_GLOBAL_INFO };
    
    const lines = reportString.toString().split('\n').filter(line => line.trim() !== '');
    
    for (const line of lines) {
        try {
            const element = JSON.parse(line);
            
            if (element.gherkinDocument) {
                processGherkinDocument(element, features, scenarios, steps);
            } else if (element.pickle) {
                processPickle(element, scenarios, steps, pickles, pickleSteps);
            } else if (element.testCase) {
                processTestCase(element, pickles, testCases, testSteps, pickleSteps, globalInfo);
            } else if (element.testStepFinished) {
                processTestStepFinished(element, testSteps, globalInfo);
            }
        } catch (error) {
            console.warn(`Failed to parse line: ${line}`, error);
        }
    }
    
    calculateFinalScenarioCount(globalInfo, testSteps);
    
    return {
        get listAllScenarioByFile() {
            return features.map(feature => ({
                file: feature.uri,
                name: feature.name,
                scenarios: feature.scenarios.flatMap(scenario =>
                    Object.values(scenario.pickles).map(pickle => ({
                        name: scenario.name,
                        status: getTestCaseStatus(pickle.testCase)
                    }))
                )
            }));
        },
        
        get globalInformation() {
            return globalInfo;
        },
        
        get failedSteps() {
            return getStepsByStatus(testSteps, 'FAILED');
        },
        
        get undefinedSteps() {
            return getStepsByStatus(testSteps, 'UNDEFINED');
        },
        
        get pendingSteps() {
            return getStepsByStatus(testSteps, 'PENDING');
        }
    };
}

function processGherkinDocument(element, features, scenarios, steps) {
    const feature = element.gherkinDocument.feature;
    const featureScenarios = [];
    
    feature.children
        .filter(child => child.scenario)
        .forEach(child => {
            const scenario = {
                name: child.scenario.name,
                id: child.scenario.id,
                location: child.scenario.location,
                uri: element.gherkinDocument.uri,
                pickles: {}
            };
            scenarios[scenario.id] = scenario;
            featureScenarios.push(scenario);
        });
    
    feature.children
        .filter(child => child.background || child.scenario)
        .forEach(child => {
            const scenarioSteps = child.background?.steps || child.scenario?.steps || [];
            scenarioSteps.forEach(step => {
                steps[step.id] = {
                    location: step.location
                };
            });
        });
    
    features.push({
        name: feature.name,
        location: feature.location,
        uri: element.gherkinDocument.uri,
        scenarios: featureScenarios
    });
}

function processPickle(element, scenarios, steps, pickles, pickleSteps) {
    const pickle = {
        name: element.pickle.name,
        scenario: scenarios[element.pickle.astNodeIds[0]]
    };
    
    pickle.steps = element.pickle.steps.map(step => ({
        id: step.id,
        name: step.text,
        pickle: pickle,
        location: steps[step.astNodeIds[0]]?.location || { line: 0 }
    }));
    
    pickle.steps.forEach(step => {
        pickleSteps[step.id] = step;
    });
    
    const scenarioId = element.pickle.astNodeIds[0];
    if (scenarios[scenarioId]) {
        scenarios[scenarioId].pickles[element.pickle.id] = pickle;
    }
    
    pickles[element.pickle.id] = pickle;
}

function processTestCase(element, pickles, testCases, testSteps, pickleSteps, globalInfo) {
    globalInfo.scenarioNumber++;
    
    const testCaseSteps = element.testCase.testSteps.map(step => ({
        id: step.id,
        pickleStep: pickleSteps[step.pickleStepId]
    }));
    
    testCaseSteps.forEach(step => {
        testSteps[step.id] = step;
    });
    
    const testCase = {
        id: element.testCase.id,
        pickleId: element.testCase.pickleId,
        steps: testCaseSteps
    };
    
    if (pickles[element.testCase.pickleId]) {
        pickles[element.testCase.pickleId].testCase = testCase;
    }
    
    testCases[testCase.id] = testCase;
}

function processTestStepFinished(element, testSteps, globalInfo) {
    const stepId = element.testStepFinished.testStepId;
    const step = testSteps[stepId];
    
    if (step) {
        globalInfo.stepsNumber++;
        step.result = element.testStepFinished.testStepResult;
        
        switch (step.result.status) {
            case 'FAILED':
                globalInfo.failedStepsNumber++;
                break;
            case 'PENDING':
                globalInfo.pendingStepNumber++;
                break;
            case 'UNDEFINED':
                globalInfo.undefinedStepsNumber++;
                break;
            case 'SKIPPED':
                globalInfo.skippedStepsNumber++;
                break;
            case 'PASSED':
                globalInfo.succeedStepsNumber++;
                break;
        }
    }
}

function calculateFinalScenarioCount(globalInfo, testSteps) {
    const processedScenarios = new Set();
    
    Object.values(testSteps).forEach(step => {
        if (step.pickleStep && step.pickleStep.pickle) {
            const scenarioId = step.pickleStep.pickle.scenario?.id;
            if (scenarioId && !processedScenarios.has(scenarioId)) {
                processedScenarios.add(scenarioId);
                
                const pickle = step.pickleStep.pickle;
                const testCase = pickle.testCase;
                
                if (testCase) {
                    const status = getTestCaseStatus(testCase);
                    switch (status) {
                        case 'failed':
                            globalInfo.failedScenarioNumber++;
                            break;
                        case 'pending':
                            globalInfo.pendingScenarioNumber++;
                            break;
                        case 'undefined':
                            globalInfo.undefinedScenarioNumber++;
                            break;
                    }
                }
            }
        }
    });
    
    globalInfo.succeedScenarioNumber = Math.max(0, 
        globalInfo.scenarioNumber - globalInfo.failedScenarioNumber - 
        globalInfo.pendingScenarioNumber - globalInfo.undefinedScenarioNumber
    );
}

module.exports = { reader };