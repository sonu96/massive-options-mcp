#!/bin/bash

echo "🧪 Running Test Coverage Analysis for Massive Options MCP"
echo "========================================================"
echo ""

# Run tests with coverage
echo "📊 Generating coverage report..."
npm run test:coverage

# Check if coverage directory exists
if [ -d "coverage" ]; then
    echo ""
    echo "✅ Coverage report generated successfully!"
    echo ""
    echo "📁 Coverage details:"
    echo "   - HTML Report: coverage/lcov-report/index.html"
    echo "   - Summary: coverage/coverage-summary.json"
    echo ""
    echo "💡 To view the HTML report, run:"
    echo "   open coverage/lcov-report/index.html"
else
    echo ""
    echo "❌ Coverage report generation failed"
    exit 1
fi

# Display coverage summary
echo ""
echo "📈 Coverage Summary:"
echo "-------------------"
if [ -f "coverage/coverage-summary.json" ]; then
    node -e "
        const coverage = require('./coverage/coverage-summary.json');
        const total = coverage.total;
        console.log('Lines:      ', total.lines.pct + '%');
        console.log('Statements: ', total.statements.pct + '%');
        console.log('Functions:  ', total.functions.pct + '%');
        console.log('Branches:   ', total.branches.pct + '%');
    "
fi

echo ""
echo "✨ Test coverage analysis complete!"