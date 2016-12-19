import * as _ from 'lodash';
import * as Rx from 'rxjs';
import os from 'os';
import smc from 'smc';
import { Client } from 'elasticsearch';
import { CpuMonitor } from 'os-usage';

const cpuUsage$ = new Rx.Subject();
const topCpuProcs$ = new Rx.Subject();
const cpuMonitor = new CpuMonitor({ limit: 2, delay: 1 });

cpuMonitor.on('cpuUsage', function(data) {
  cpuUsage$.next({
    user: parseFloat(data.user, 10),
    sys: parseFloat(data.sys, 10),
    idle: parseFloat(data.idle, 10),
  });
});

cpuMonitor.on('topCpuProcs', function(data) {
  topCpuProcs$.next(
    data.reduce(( res, data, idx ) => {
      res[idx] = { cpu: parseFloat(data.cpu, 10), cmd: data.command };
      return res;
    }, {})
  );
});

const smcStats = () => {
  const cpuTemp = _.chain(8).times().map(n => smc.get(`TC${n}C`)).compact().value();
  const fans = _.chain(smc.fans()).times().map(smc.fanRpm).value();
  return {
    cpuTemp,
    fans,
  };
};

const osStats = () => ({
  freemem: os.freemem(),
  hostname: os.hostname(),
  platform:  os.platform(),
  release:  os.release(),
  uptime: os.uptime(),
});

const combineStats = (cpuUsage, procs) => {
  const timestamp = new Date();

  return {
    ...osStats(),
    ...smcStats(),
    cpuUsage,
    procs,
    timestamp,
  };
};

const client = new Client({
  host: 'localhost:9200',
  log: 'trace',
});

const logData = (data) => {
  client.create({
    index: 'load',
    type: 'load',
    id: data.timestamp.getTime(),
    body: data,
  }, (error, response) => {
    // ...
  });
};

Rx.Observable.combineLatest(
  cpuUsage$,
  topCpuProcs$,
  combineStats,
).subscribe(logData);
