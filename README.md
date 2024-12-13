# VRF Oracle

Oracle that generates verifiable random numbers.


## Setup

1. Run run.js once, it'll crash at this point, that's ok.
```sh
node run.js
```

2. Generate your RSA private key:
```sh
node genKeys.js
```
Your public key is now saved in `pubkey.pem`. The full path will be written in the console after launch.

4. cd back to the sources root and run `run.js` again. Note your address in the line like this:
```
====== my single address: UYBHEJNRNQCC3MGK5UO7T6YUHPWTSLXC
```
Kill the process with Ctrl-C.

6. Edit `vrf-oracle-template.oscript` and replace `your_oracle_address` and `your_public_key` with your address and public key respectively. You can remove the header/footer like `-----BEGIN PUBLIC KEY-----` and line-breaks from the public key.

7. Deploy this AA from your Obyte wallet. Note its address.

8. Edit `conf.js` and set `exports.vrf_oracle_aa` to the address of the newly deployed AA.

9. Send some Bytes to your VRF oracle address from step 5 (not to the AA address). They are needed to pay fees.

10. Run `run.js` again and leave it running as a daemon:
```sh
node run.js 2>errlog
```
Type Ctrl-Z, then `bg`, then exit the session.

Your oracle will watch for randomness requests from City AA (and maybe other consumers that need secure randomness) and generate and post randomness accordingly.

If you need to add more consumers, edit `consumer_aas` in `conf.js`.

