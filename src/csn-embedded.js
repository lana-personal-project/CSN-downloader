// inject this script into page to access pages's js object (player) and communicate
// with background via content-script by an event
// put this into function to avoid conflict with page's js
(async () => {
    const links = {};
    const qualities = ['128', '320', 'flac'];
    try {
        // player is page's js object that control the player
        for (const source of player.getConfig().sources) {
            for (const quality of qualities) {
                if (source.file.match(regexFor(quality)))
                    links [quality] = source.file;
            }
        }

        await fixMp3Links(links);
        await fixFlacLink(links);
    } catch (e) {
        // player is not defined, probably this is not a player page.
    }

    document.dispatchEvent(new CustomEvent('gotLinkFromCSN', { detail: links }));
    document.addEventListener('startDownload', event => {
        const config = event.detail;
        const availableQualities = Object.keys(links);
        const download = availableQualities.filter(quality => config.qualities.includes(quality));
        const fallbackDownload = availableQualities.filter(quality => config.fallbacks.includes(quality));
        downloadFiles(download.length > 0 ? download : fallbackDownload);
    });

    function downloadFiles(downloadQualities) {
        function downloadNext(i) {
            if (i >= downloadQualities.length) return;

            const a = document.createElement('A');
            a.href = links[downloadQualities[i]];
            a.target = '_parent';
            a.setAttribute('download', 'download');
            a.click();
            setTimeout(() => downloadNext(i + 1), 800);
        }

        downloadNext(0);
    }

    function regexFor(quality) {
        return new RegExp(`\\/downloads\\/.+\\/${quality}\\/`, 'g');
    }

    async function fixFlacLink(links) {
        if (links['flac']) {
            return;
        }
        const replaceable = qualities.filter(quality => quality !== 'flac');
        for (const quality of replaceable) {
            if (links.hasOwnProperty(quality)) {
                const flacLink = links[quality]
                    .replace(new RegExp(`(?<=/)${quality}`, 'g'), 'flac')
                    .replace(/(?<=\.)mp3/g, 'flac');
                if (await testLink(flacLink)) {
                    links['flac'] = flacLink;
                    return;
                }
            }
        }
    }

    async function fixMp3Links(links) {
        const fixable = qualities.filter(quality => quality !== '128' || quality !== 'flac');
        for (const quantity of fixable) {
            if (links.hasOwnProperty(quantity)) {
                continue;
            }
            const mp3Link = links['128'].replace(new RegExp('(?<=/)128', 'g'), quantity);
            if (await testLink(mp3Link)) {
                links[quantity] = mp3Link;
            }
        }
    }

    // create a audio element to check if link ok
    // by this way we can bypass the cors
    async function testLink(link) {
        const audio = document.createElement('AUDIO');
        try {
            await new Promise((resolve, reject) => {
                audio.addEventListener('loadedmetadata', () => {
                    resolve();
                });
                audio.addEventListener('error', () => {
                    reject();
                });
                audio.src = link;
                audio.load();
            });

            console.log(`found hidden link: ${link}`);
            return true;
        } catch (e) {
            return false;
        }
    }
})();
