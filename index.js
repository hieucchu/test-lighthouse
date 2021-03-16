const fs = require('fs');
const fse = require('fs-extra');
const lighthouse = require('lighthouse');
const chromeLauncher = require('chrome-launcher');
const slugs = require('./list.json');

const metricFilter = [
  'first-contentful-paint',
  'speed-index',
  'largest-contentful-paint',
  'interactive',
  'total-blocking-time',
  'cumulative-layout-shift'
];

// let slug = 'uu-dai-johnson-johnson-chinh-hang';
// slug = 'duong-da-make-up-nhat-ban-senka-anessa-tsubaki';
// slug = 'tiki-sale-1212-sieu-dinh';
// slug = 'ma-giam-gia';
// slug = 'page-builder?preview=1&page_id=662';

const timeModifier = new Date().toISOString();
const logFile = `lighthouse-log-${timeModifier}.txt`;
const resultListJsonFile = `lighthouse-result-${timeModifier}.json`;
fse.outputFileSync(logFile, '');
fse.outputFileSync(resultListJsonFile, '');

const logger = (content) => {
  if (content) {
    console.log(content);
    fse.appendFileSync(logFile, `${content}\r\n`);
  } else {
    console.log();
    fse.appendFileSync(logFile, '\r\n');
  }
};

const resultList = [];

(async () => {
  const chrome = await chromeLauncher.launch({ chromeFlags: [] });
  for (let i = 0; i < slugs.length; i += 1) {
    try {
      const slug = slugs[i];
      const fromURL = `https://tiki.vn/khuyen-mai/${slug}`;
      const toURL = `http://localhost:8080/khuyen-mai/${slug}`;
      console.log(`Running lighthouse for ${fromURL}, index ${i}`);

      const options = {
        extends: 'lighthouse:default',
        settings: {
          maxWaitForFcp: 15 * 1000,
          maxWaitForLoad: 35 * 1000,
          // lighthouse:default is mobile by default
          // Skip the h2 audit so it doesn't lie to us. See https://github.com/GoogleChrome/lighthouse/issues/6539
          skipAudits: ['uses-http2']
        },
        output: 'json',
        onlyCategories: ['performance'],
        port: chrome.port
      };
      const fromResult = await lighthouse(fromURL, options);
      const toResult = await lighthouse(toURL, options);

      // `.report` is the HTML report as a string
      const fromReportJSON = fromResult.report;
      const toReportJSON = toResult.report;

      const dir = './lighthouse-report';
      fse.outputFileSync(`${dir}/${slug}_ORIGINAL.json`, fromReportJSON);
      fse.outputFileSync(`${dir}/${slug}_OPTIMIZED.json`, toReportJSON);

      const originalScore = fromResult.lhr.categories.performance.score * 100;
      const optimizedScore = toResult.lhr.categories.performance.score * 100;

      logger(`Original score for ${fromURL}: ${originalScore}/100`);
      logger(`New optimized score: ${optimizedScore}/100`);
      logger();

      const result = {};
      resultList.push(result);

      result.slug = slug;
      result.url = fromURL;
      result.originalScore = originalScore;
      result.optimizedScore = optimizedScore;

      for (const metric of metricFilter) {
        const fromMetric = fromResult.lhr.audits[metric];
        const toMetric = toResult.lhr.audits[metric];

        const isCLS = metric === 'cumulative-layout-shift';

        const diff = (
          (fromMetric.numericValue - toMetric.numericValue) /
          (isCLS ? 1 : 1000)
        ).toFixed(2);

        const log = (() => {
          const absoluteDiff = Math.abs(diff);
          if (Math.sign(diff) === -1) {
            return `${absoluteDiff}${isCLS ? ' decrease' : 's slower'}`;
          }
          if (Math.sign(diff) === 0) {
            return 'unchanged';
          }
          return `${absoluteDiff}${isCLS ? ' increase' : 's faster'}`;
        })();

        const originalNumericValue = fromMetric.numericValue.toFixed(2);
        const optimizedNumericValue = toMetric.numericValue.toFixed(2);

        logger(`${fromMetric.title} is ${log}`);
        logger(
          `(old: ${originalNumericValue}${
            isCLS ? '' : 'ms'
          }, new: ${optimizedNumericValue}${isCLS ? '' : 'ms'})`
        );
        logger();

        result[metric] = {};
        result[metric].title = fromMetric.title;
        // in ms
        result[metric].originalNumericValue = originalNumericValue;
        result[metric].optimizedNumericValue = optimizedNumericValue;

        // to show red-orange-green indicator
        result[metric].originalColorScore = fromMetric.score;
        result[metric].optimizedColorScore = toMetric.score;

        result[metric].diffString = log;
        fse.outputFileSync(
          resultListJsonFile,
          JSON.stringify(resultList, null, 2)
        );
      }
      logger('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    } catch (err) {
      continue;
    }
  }

  // fse.outputFileSync(resultListJsonFile, JSON.stringify(resultList, null, 2));
  await chrome.kill();
})();
