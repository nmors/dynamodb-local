"use strict";

var os = require('os'),
    spawn = require('child_process').spawn,
    fs = require('fs'),
    http = require('http'),
    tar = require('tar'),
    zlib = require('zlib'),
    path = require('path'),
    mkdirp = require('mkdirp');

const JARNAME = 'DynamoDBLocal.jar';

var tmpDynamoLocalDirDest = os.tmpdir() + 'dynamodb-local',
    runningProcesses = {},
    DynamoDbLocal = {
      /**
       *
       * @param port
       * @param dbPath if omitted will use in memory
       * @param additionalArgs
       * @returns {Promise.<ChildProcess>}
       */
      launch: function (port, dbPath, additionalArgs) {
        if (runningProcesses[port]) {
          return new Promise(function (resolve, reject) {
            resolve(runningProcesses[port]);
          });
        }

        if (!additionalArgs) {
          additionalArgs = [];
        }
        else if (Array.isArray(additionalArgs)) {
          additionalArgs = [additionalArgs];
        }

        if (!dbPath) {
          additionalArgs.push('-inMemory');
        }
        else {
          additionalArgs.push('-dbPath', dbPath);
        }

        return installDynamoDbLocal()
            .then(function () {
              let args = [
                '-Djava.library.path=./DynamoDBLocal_lib',
                '-jar',
                JARNAME,
                '-port',
                port
              ];
              args = args.concat(additionalArgs);

              let child = spawn('java', args, {cwd: tmpDynamoLocalDirDest, env: process.env});

              if (!child.pid) throw new Error("Unable to launch DyanmoDBLocal process");

              runningProcesses[port] = child;

              console.log("DynamoDbLocal(" + child.pid + ") started on port ", port);

              return child;
            });
      },
      stop: function (port) {
        if (runningProcesses[port]) {
          runningProcesses[port].kill('SIGKILL');
          delete runningProcesses[port];
        }
      },
      relaunch: function (port, db) {
        this.stop(port);
        this.launch(port, db);
      }
    };

module.exports = DynamoDbLocal;

function installDynamoDbLocal() {
  console.log("Checking for ", tmpDynamoLocalDirDest);
  return new Promise(function (resolve, reject) {
    try {
      if (fs.existsSync(tmpDynamoLocalDirDest + '/' + JARNAME)) {
        resolve();
        return;
      }
    } catch (e) {
    }

    fs.mkdirSync(tmpDynamoLocalDirDest);

    http
        .get('http://dynamodb-local.s3-website-us-west-2.amazonaws.com/dynamodb_local_latest.tar.gz', function (response) {
          if (302 != response.statusCode) {
            reject("Error getting DyanmoDb local latest tar.gz location: " + response.statusCode);
          }

          http
              .get(response.headers['location'], function (redirectResponse) {
                if (200 != redirectResponse.statusCode) {
                  reject("Error getting DyanmoDb local latest tar.gz location " + response.headers['location'] + ": " + redirectResponse.statusCode);
                }
                redirectResponse
                    .pipe(zlib.Unzip())
                    .pipe(tar.Extract({path: tmpDynamoLocalDirDest}))
                    .on('end', function () {
                      resolve();
                    })
                    .on('error', function (err) {
                      reject(err);
                    });
              })
              .on('error', function (e) {
                reject(e.message);
              });
        })
        .on('error', function (e) {
          reject(e.message);
        });
  });
}
